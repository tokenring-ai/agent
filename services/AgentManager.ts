import type TokenRingApp from "@tokenring-ai/app";
import type {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import {setTimeout as delay} from "node:timers/promises";
import Agent from "../Agent.ts";
import type {ParsedAgentConfig} from "../schema.ts";
import {AgentEventState} from "../state/agentEventState.ts";
import type {AgentCheckpointData, AgentCreationContext} from "../types.js";
import {formatAgentId} from "../util/formatAgentId.ts";

export default class AgentManager implements TokenRingService {
  readonly name = "AgentManager";
  description =
    "A service which manages agent configurations and spawns agents.";
  private readonly cleanupCheckIntervalMs = 15000;
  private agents = new Map<
    string,
    { agent: Agent; shutdownController: AbortController }
  >();

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await delay(this.cleanupCheckIntervalMs, null, {signal});
      try {
        this.checkAndDeleteIdleAgents();
      } catch (error: unknown) {
        this.app.serviceError(this, "Error while housekeeping agents:", error);
      }
    }
  }

  constructor(readonly app: TokenRingApp) {
  }
  private agentConfigRegistry = new KeyedRegistry<ParsedAgentConfig>();

  getAgentConfigEntries = this.agentConfigRegistry.entries;
  getAgentConfig = this.agentConfigRegistry.getItemByName;
  getAgentTypes = this.agentConfigRegistry.getAllItemNames;
  getAgentTypesLike = this.agentConfigRegistry.getItemEntriesLike;

  addAgentConfigs(...configs: ParsedAgentConfig[]) {
    for (const config of configs) {
      this.agentConfigRegistry.register(config.agentType, config);
    }
  }

  spawnAgentFromCheckpoint(
    checkpoint: AgentCheckpointData,
    config: Partial<ParsedAgentConfig> = {},
  ) {
    const agentConfig = this.agentConfigRegistry.requireItemByName(
      checkpoint.agentType,
    );
    return this.createAgent(
      {
        ...agentConfig,
        createMessage: `Recovered agent of type: ${checkpoint.agentType} from checkpoint of agent ${formatAgentId(checkpoint.agentId)}`,
        ...config,
      },
      checkpoint.state,
    );
  }

  spawnAgent({
               agentType,
               headless,
             }: {
    agentType: string;
    headless: boolean;
  }): Agent {
    return this.spawnAgentFromConfig({
      ...this.agentConfigRegistry.requireItemByName(agentType),
      headless,
    });
  }

  spawnAgentFromConfig(config: ParsedAgentConfig) {
    return this.createAgent({
      ...config,
      createMessage: `Agent created from config: ${config.displayName} (${config.agentType})`,
    });
  }

  spawnSubAgent(
    agent: Agent,
    agentType: string,
    config: Partial<ParsedAgentConfig>,
  ): Agent {
    const agentConfig = this.agentConfigRegistry.requireItemByName(agentType);
    // Create a new agent of the specified type
    const newAgent = this.createAgent({
      ...agentConfig,
      createMessage: `Subagent of agent ${agent.id} created from config: ${agentConfig.displayName} (${agentConfig.agentType})`,
      ...config,
    });

    for (const item of newAgent.stateManager.slices()) {
      item?.transferStateFromParent?.(agent);
    }

    /*agent.infoMessage(
      `Created new agent: ${newAgent.config.displayName} (${formatAgentId(newAgent.id)})`,
    );*/
    return newAgent;
  }

  deleteAgent(agentId: string, reason: string): void {
    const agentEntry = this.agents.get(agentId);
    if (!agentEntry) throw new Error(`Agent ${agentId} not found`);

    const {agent, shutdownController} = agentEntry;
    agent.abortCurrentOperation(reason);
    shutdownController.abort(reason);

    agent.mutateState(AgentEventState, (state) => {
      state.emit({
        type: "agent.stopped",
        message: reason,
        timestamp: Date.now(),
      });
    });

    for (const service of this.app.getServices()) {
      service.detach?.(agent);
    }

    this.agents.delete(agentId);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values()).map(({agent}) => agent);
  }

  private createAgent(
    options: ParsedAgentConfig,
    state: AgentCheckpointData["state"] = {},
  ) {
    const shutdownController = new AbortController();

    const agent = new Agent(
      this.app,
      state,
      options,
      shutdownController.signal,
    );

    this.agents.set(agent.id, {agent, shutdownController});

    const creationContext: AgentCreationContext = {
      items: [],
    };

    for (const service of this.app.getServices()) {
      try {
        service.attach?.(agent, creationContext);
      } catch (err: unknown) {
        agent.errorMessage("Agent threw error during creation: ", err as Error)
      }
    }

    agent.mutateState(AgentEventState, (state) => {
      state.emit({
        type: "agent.created",
        timestamp: Date.now(),
        message: agent.config.createMessage,
        details: creationContext.items
      });
    });

    return agent;
  }

  getAgent(id: string): Agent | null {
    return this.agents.get(id)?.agent ?? null;
  }

  private checkAndDeleteIdleAgents() {
    for (const [agentId, {agent}] of this.agents.entries()) {
      const idleTimeout = agent.config.idleTimeout;
      const maxRunTime = agent.config.maxRunTime;
      if (idleTimeout && agent.getIdleDuration() > idleTimeout * 1000) {
        try {
          this.deleteAgent(
            agentId,
            `Agent has been idle for ${agent.getIdleDuration() / 1000} seconds`,
          );
          this.app.serviceOutput(
            this,
            `Agent ${agent.id} has been deleted due to inactivity.`,
          );
        } catch (err: unknown) {
          this.app.serviceError(
            this,
            `Failed to delete idle agent ${agent.id}:`,
            err,
          );
        }
      } else if (maxRunTime && agent.getRunDuration() > maxRunTime * 1000) {
        try {
          this.deleteAgent(
            agentId,
            `Agent has been running for ${agent.getRunDuration() / 1000} seconds`,
          );
          this.app.serviceOutput(
            this,
            `Agent ${agent.id} has been deleted due to max runtime.`,
          );
        } catch (err: unknown) {
          this.app.serviceError(
            this,
            `Failed to delete agent ${agent.id} due to max runtime:`,
            err,
          );
        }
      }
    }

    for (const [agentType, agentSpec] of this.agentConfigRegistry.entries()) {
      if (agentSpec.minimumRunning > 0) {
        let agentCount = 0;
        for (const {agent} of this.agents.values()) {
          if (agent.config.agentType === agentType) agentCount++;
        }

        while (agentCount++ < agentSpec.minimumRunning) {
          this.app.serviceOutput(
            this,
            `Agent type ${agentType} has less than the minimum number of running agents. Starting new agent...`,
          );
          this.spawnAgent({agentType, headless: true});
        }
      }
    }
  }
}
