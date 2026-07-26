import { setTimeout as delay } from "node:timers/promises";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import { deepEquals } from "bun";
import Agent from "../Agent.ts";
import type { ParsedAgentConfig } from "../schema.ts";
import { AgentEventState } from "../state/agentEventState.ts";
import type { AgentCheckpointData, AgentCreationContext } from "../types.js";
import { formatAgentId } from "../util/formatAgentId.ts";
import { type AgentListEntry, projectAgentList } from "./projectAgentList.ts";

export default class AgentManager implements TokenRingService {
  readonly name = "AgentManager";
  description = "A service which manages agent configurations and spawns agents.";
  private readonly cleanupCheckIntervalMs = 15000;
  private agents = new EnhancedMap<string, { agent: Agent; shutdownController: AbortController }>();
  private agentListeners = new Set<() => void>();
  private agentStateUnsubscribers = new EnhancedMap<string, () => void>();
  private agentConfigRegistry = new KeyedRegistry<ParsedAgentConfig>();
  getAgentConfigEntries = this.agentConfigRegistry.entriesArray;
  getAgentConfig = this.agentConfigRegistry.get;
  getAgentTypes = this.agentConfigRegistry.keysArray;
  getAgentTypesLike = this.agentConfigRegistry.entriesLike;

  constructor(readonly app: TokenRingApp) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await delay(this.cleanupCheckIntervalMs, null, { signal });
      try {
        this.checkAndDeleteIdleAgents();
      } catch (error: unknown) {
        this.app.serviceError(this, "Error while housekeeping agents:", error);
      }
    }
  }

  addAgentConfigs(...configs: ParsedAgentConfig[]) {
    for (const config of configs) {
      this.agentConfigRegistry.set(config.agentType, config);
    }
  }

  spawnAgentFromCheckpoint(checkpoint: AgentCheckpointData, config: Partial<ParsedAgentConfig> = {}) {
    const agentConfig = this.agentConfigRegistry.require(checkpoint.agentType);
    return this.createAgent(
      {
        ...agentConfig,
        createMessage: `Recovered agent of type: ${checkpoint.agentType} from checkpoint of agent ${formatAgentId(checkpoint.agentId)}`,
        ...config,
      },
      checkpoint.state,
    );
  }

  spawnAgent({ agentType, headless }: { agentType: string; headless: boolean }): Agent {
    return this.spawnAgentFromConfig({
      ...this.agentConfigRegistry.require(agentType),
      headless,
    });
  }

  spawnAgentFromConfig(config: ParsedAgentConfig) {
    return this.createAgent({
      ...config,
      createMessage: `Agent created from config: ${config.displayName} (${config.agentType})`,
    });
  }

  spawnSubAgent(agent: Agent, agentType: string, config: Partial<ParsedAgentConfig>): Agent {
    const agentConfig = this.agentConfigRegistry.require(agentType);
    // Create a new agent of the specified type
    const newAgent = this.createAgent({
      ...agentConfig,
      createMessage: `Subagent of agent ${agent.id} created from config: ${agentConfig.displayName} (${agentConfig.agentType})`,
      ...config,
    });

    for (const item of newAgent.stateManager.slices()) {
      item.transferStateFromParent(agent);
    }

    /*agent.infoMessage(
      `Created new agent: ${newAgent.config.displayName} (${formatAgentId(newAgent.id)})`,
    );*/
    return newAgent;
  }

  deleteAgent(agentId: string, reason: string): boolean {
    const agentEntry = this.agents.get(agentId);
    if (!agentEntry) return false;

    this.untrackAgentState(agentId);

    const { agent, shutdownController } = agentEntry;
    agent.abortCurrentOperation(reason);
    shutdownController.abort(reason);

    agent.mutateState(AgentEventState, state => {
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
    this.notifyAgentListChanged();
    return true;
  }

  async *subscribeAgentsAsync(signal: AbortSignal): AsyncGenerator<AgentListEntry[]> {
    // TODO: We should move the agent list into the app state, so we can use the app state subscription mechanism and get rid of these listeners
    if (signal.aborted) {
      return;
    }

    let pending = true;
    let resolveNext: (() => void) | null = null;
    let lastSnapshot: AgentListEntry[] | undefined;

    const listener = () => {
      pending = true;
      resolveNext?.();
      resolveNext = null;
    };

    this.agentListeners.add(listener);

    const abortHandler = () => {
      resolveNext?.();
      resolveNext = null;
    };

    signal.addEventListener("abort", abortHandler);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- can be mutated asynchronously
      while (!signal.aborted) {
        if (!pending) {
          await new Promise<void>(resolve => {
            resolveNext = resolve;
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- can be mutated asynchronously
        if (signal.aborted) {
          break;
        }

        pending = false;
        const snapshot = projectAgentList(this.getAgents());
        if (lastSnapshot !== undefined && deepEquals(snapshot, lastSnapshot, true)) {
          continue;
        }
        lastSnapshot = snapshot;
        yield snapshot;
      }
    } finally {
      this.agentListeners.delete(listener);
      signal.removeEventListener("abort", abortHandler);
    }
  }

  getAgents(): Agent[] {
    return this.agents.mapValues(({ agent }) => agent);
  }

  getAgent(id: string): Agent | null {
    return this.agents.get(id)?.agent ?? null;
  }

  private createAgent(options: ParsedAgentConfig, state: AgentCheckpointData["state"] = {}) {
    const shutdownController = new AbortController();

    const agent = new Agent(this.app, state, options, shutdownController.signal);

    this.agents.set(agent.id, { agent, shutdownController });
    this.trackAgentState(agent);
    this.notifyAgentListChanged();

    const creationContext: AgentCreationContext = {
      items: [],
    };

    for (const service of this.app.getServices()) {
      try {
        service.attach?.(agent, creationContext);
      } catch (err) {
        agent.errorMessage("Agent threw error during creation: ", err as Error);
      }
    }

    agent.mutateState(AgentEventState, state => {
      state.emit({
        type: "agent.created",
        timestamp: Date.now(),
        message: agent.config.createMessage,
        details: creationContext.items,
      });
    });

    return agent;
  }

  private notifyAgentListChanged() {
    for (const listener of this.agentListeners) {
      listener();
    }
  }

  private trackAgentState(agent: Agent) {
    if (this.agentStateUnsubscribers.has(agent.id)) {
      return;
    }

    const unsubscribe = agent.subscribeState(AgentEventState, () => {
      this.notifyAgentListChanged();
    });
    this.agentStateUnsubscribers.set(agent.id, unsubscribe);
  }

  private untrackAgentState(agentId: string) {
    const callback = this.agentStateUnsubscribers.deleteAndReturnItem(agentId);
    callback?.();
  }

  private checkAndDeleteIdleAgents() {
    for (const [agentId, { agent }] of this.agents) {
      const idleTimeout = agent.config.idleTimeout;
      const maxRunTime = agent.config.maxRunTime;
      if (idleTimeout && agent.getIdleDuration() > idleTimeout * 1000) {
        try {
          this.deleteAgent(agentId, `Agent has been idle for ${agent.getIdleDuration() / 1000} seconds`);
          this.app.serviceOutput(this, `Agent ${agent.id} has been deleted due to inactivity.`);
        } catch (err) {
          this.app.serviceError(this, `Failed to delete idle agent ${agent.id}:`, err);
        }
      } else if (maxRunTime && agent.getRunDuration() > maxRunTime * 1000) {
        try {
          this.deleteAgent(agentId, `Agent has been running for ${agent.getRunDuration() / 1000} seconds`);
          this.app.serviceOutput(this, `Agent ${agent.id} has been deleted due to max runtime.`);
        } catch (err) {
          this.app.serviceError(this, `Failed to delete agent ${agent.id} due to max runtime:`, err);
        }
      }
    }

    for (const [agentType, agentSpec] of this.agentConfigRegistry.entriesArray()) {
      if (agentSpec.minimumRunning > 0) {
        let agentCount = 0;
        for (const { agent } of this.agents.values()) {
          if (agent.config.agentType === agentType) agentCount++;
        }

        while (agentCount++ < agentSpec.minimumRunning) {
          this.app.serviceOutput(this, `Agent type ${agentType} has less than the minimum number of running agents. Starting new agent...`);
          this.spawnAgent({ agentType, headless: true });
        }
      }
    }
  }
}
