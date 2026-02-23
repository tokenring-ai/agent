import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import {ParsedAgentConfig} from "../schema.ts";
import {AgentCheckpointData} from "../types.js";
import {formatAgentId} from "../util/formatAgentId.js";
import { setTimeout} from "node:timers/promises";

export default class AgentManager implements TokenRingService {
  readonly name = "AgentManager";
  description = "A service which manages agent configurations and spawns agents.";
  private readonly cleanupCheckIntervalMs = 15000;

  constructor(readonly app: TokenRingApp) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await setTimeout(this.cleanupCheckIntervalMs);
      try {
        await this.checkAndDeleteIdleAgents();
      } catch (error) {
        this.app.serviceError("[AgentManager] Error while housekeeping agents:", error);
      }
    }
  }

  private agents = new Map<string, { agent: Agent, shutdownController: AbortController }>();
  private agentConfigRegistry = new KeyedRegistry<ParsedAgentConfig>();

  addAgentConfig = this.agentConfigRegistry.register;
  getAgentConfigEntries = this.agentConfigRegistry.entries;
  getAgentConfig = this.agentConfigRegistry.getItemByName;
  getAgentTypes = this.agentConfigRegistry.getAllItemNames;
  getAgentTypesLike = this.agentConfigRegistry.getItemEntriesLike;

  addAgentConfigs(agentConfigs: Record<string, ParsedAgentConfig>) {
    for (const agentType in agentConfigs) {
      agentConfigs[agentType].agentType ??= agentType;
      this.addAgentConfig(agentType, agentConfigs[agentType]);
    }
  }


  async spawnAgentFromCheckpoint(checkpoint: AgentCheckpointData, config: Partial<ParsedAgentConfig>) {
    const shutdownController = new AbortController();
    const agent = await Agent.createAgentFromCheckpoint(this.app, checkpoint, config, shutdownController.signal);

    this.agents.set(agent.id, { agent, shutdownController });

    return agent;
  }

  async spawnAgent({agentType, headless} : { agentType: string, headless: boolean}): Promise<Agent> {
    return this.spawnAgentFromConfig({ ...this.agentConfigRegistry.requireItemByName(agentType), headless});
  }

  async spawnAgentFromConfig(config: ParsedAgentConfig) {
    return this.createAgent({ ...config, createMessage: `Agent created from config: ${config.name} (${config.agentType})`});
  }

  async spawnSubAgent(agent: Agent, agentType: string, config: Partial<ParsedAgentConfig>): Promise<Agent> {
    const agentConfig = this.agentConfigRegistry.requireItemByName(agentType);
    // Create a new agent of the specified type
    const newAgent = await this.createAgent({
      ...agentConfig,
      createMessage: `Subagent of agent ${agent.id} created from config: ${agentConfig.name} (${agentConfig.agentType})`,
      ...config,
    });

    for (const [name, item] of newAgent.stateManager.entries()) {
      item?.transferStateFromParent?.(agent);
    }

    agent.infoMessage(
      `Created new agent: ${newAgent.config.name} (${formatAgentId(newAgent.id)})`,
    );
    return newAgent;
  }

  private async createAgent(options: ParsedAgentConfig) {
    const shutdownController = new AbortController();
    const agent = new Agent(this.app, options, shutdownController.signal);

    this.agents.set(agent.id, { agent, shutdownController });

    this.app.trackPromise(signal => agent.run(signal));

    return agent;
  }

  async deleteAgent(agentId: string, reason: string): Promise<void> {
    const agentEntry = this.agents.get(agentId);
    if (!agentEntry) throw new Error(`Agent ${agentId} not found`);

    const { agent, shutdownController } = agentEntry;
    agent.requestAbort(reason);
    shutdownController.abort(reason);

    this.agents.delete(agentId);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values()).map(({ agent }) => agent);
  }

  getAgent(id: string): Agent | null {
    return this.agents.get(id)?.agent ?? null;
  }

  private async checkAndDeleteIdleAgents() {
    for (const [agentId,{ agent }] of this.agents.entries()) {
      const idleTimeout = agent.config.idleTimeout;
      const maxRunTime = agent.config.maxRunTime;
      if (idleTimeout && agent.getIdleDuration() > idleTimeout * 1000) {
        try {
          await this.deleteAgent(agentId, `Agent has been idle for ${agent.getIdleDuration() / 1000} seconds`);
          this.app.serviceOutput(`Agent ${agent.id} has been deleted due to inactivity.`);
        } catch (err) {
          this.app.serviceError(`Failed to delete idle agent ${agent.id}:`, err);
        }
      } else if (maxRunTime && agent.getRunDuration() > maxRunTime * 1000) {
        try {
          await this.deleteAgent(agentId, `Agent has been running for ${agent.getRunDuration() / 1000} seconds`);
          this.app.serviceOutput(`Agent ${agent.id} has been deleted due to max runtime.`);
        } catch (err) {
          this.app.serviceError(`Failed to delete agent ${agent.id} due to max runtime:`, err);
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
          this.app.serviceOutput(`Agent type ${agentType} has less than the minimum number of running agents. Starting new agent...`);
          await this.spawnAgent({agentType, headless: true});
        }
      }
    }
  }
}
