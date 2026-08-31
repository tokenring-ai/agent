import { setTimeout as delay } from "node:timers/promises";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import { like } from "@tokenring-ai/utility/string/like";
import { deepEquals } from "bun";
import Agent from "../Agent.ts";
import type { AgentSource, ParsedAgentConfig } from "../schema.ts";
import { AgentEventState } from "../state/agentEventState.ts";
import type { AgentCheckpointData, AgentCreationContext } from "../types.js";
import { formatAgentId } from "../util/formatAgentId.ts";
import { type AgentListEntry, projectAgentList } from "../util/projectAgentList.ts";

export default class AgentManager implements TokenRingService {
  readonly name = "AgentManager";
  description = "A service which manages agent configurations and spawns agents.";
  private readonly cleanupCheckIntervalMs = 15000;
  private agents = new EnhancedMap<string, { agent: Agent; shutdownController: AbortController }>();
  private agentListeners = new Set<() => void>();
  private agentStateUnsubscribers = new EnhancedMap<string, () => void>();
  /** Agent types defined in the configuration layers — shipped with the app and its plugins. */
  private bundledAgentConfigs = new KeyedRegistry<ParsedAgentConfig>();
  /**
   * Agent types read from the workspace agent directory. Kept apart from {@link bundledAgentConfigs}
   * because {@link reconfigure} reconciles that registry against the config on every configuration
   * change, which would otherwise delete anything registered from disk.
   */
  private workspaceAgentConfigs = new KeyedRegistry<ParsedAgentConfig>();

  constructor(readonly app: TokenRingApp) {}

  /** Every agent type, workspace definitions shadowing bundled ones of the same name. */
  getAgentConfigEntries = (): [string, ParsedAgentConfig][] => {
    const merged = new Map(this.bundledAgentConfigs.entriesArray());
    for (const [type, config] of this.workspaceAgentConfigs.entriesArray()) merged.set(type, config);
    return [...merged];
  };

  getAgentConfig = (agentType: string): ParsedAgentConfig | undefined => {
    return this.workspaceAgentConfigs.get(agentType) ?? this.bundledAgentConfigs.get(agentType);
  };

  getAgentTypes = (): string[] => this.getAgentConfigEntries().map(([type]) => type);

  getAgentTypesLike = (likeName: string | string[]): [string, ParsedAgentConfig][] => {
    const patterns = Array.isArray(likeName) ? likeName : [likeName];
    return this.getAgentConfigEntries().filter(([type]) => patterns.some(pattern => like(pattern, type)));
  };

  /** Where an agent type came from, or undefined when it is not registered. */
  getAgentSource(agentType: string): AgentSource | undefined {
    if (this.workspaceAgentConfigs.get(agentType)) return "workspace";
    if (this.bundledAgentConfigs.get(agentType)) return "bundled";
    return undefined;
  }

  requireAgentConfig(agentType: string): ParsedAgentConfig {
    const config = this.getAgentConfig(agentType);
    if (!config) throw new Error(`Item ${agentType} not found`);
    return config;
  }

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
      this.bundledAgentConfigs.set(config.agentType, config);
    }
  }

  /**
   * Reconciles bundled agent type configs against the latest package config: creates missing
   * types, updates existing ones, and removes types that are no longer defined.
   *
   * Workspace agent types are untouched — they are owned by
   * {@link import("../AgentDirectoryService.ts").default} and reconciled by
   * {@link setWorkspaceAgentConfigs}.
   */
  reconfigure(agents: Record<string, Omit<ParsedAgentConfig, "agentType">>): void {
    this.bundledAgentConfigs.reconcileAgainst(agents, {
      creating: (name, config) => ({ agentType: name, ...config }),
      updating: (name, _existing, config) => ({ agentType: name, ...config }),
    });
  }

  /**
   * Replaces the set of agent types loaded from the workspace agent directory. Types missing from
   * `agents` are removed, so this is the whole directory every time, not a patch.
   */
  setWorkspaceAgentConfigs(agents: Record<string, Omit<ParsedAgentConfig, "agentType">>): void {
    this.workspaceAgentConfigs.reconcileAgainst(agents, {
      creating: (name, config) => ({ agentType: name, ...config }),
      updating: (name, _existing, config) => ({ agentType: name, ...config }),
    });
  }

  spawnAgentFromCheckpoint(checkpoint: AgentCheckpointData, config: Partial<ParsedAgentConfig> = {}) {
    const agentConfig = this.requireAgentConfig(checkpoint.agentType);
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
      ...this.requireAgentConfig(agentType),
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
    const agentConfig = this.requireAgentConfig(agentType);
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

    for (const service of this.app.services.values()) {
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
    try {
      const shutdownController = new AbortController();

      const agent = new Agent(this.app, state, options, shutdownController.signal);

      this.agents.set(agent.id, { agent, shutdownController });
      this.trackAgentState(agent);
      this.notifyAgentListChanged();

      const creationContext: AgentCreationContext = {
        items: [],
      };

      for (const service of this.app.services.values()) {
        try {
          service.attach?.(agent, creationContext);
        } catch (err) {
          this.app.serviceError(this, "Error attaching service to agent:", err as Error);
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
    } catch (err) {
      this.app.serviceError(this, "Error creating agent:", err);
      throw err;
    }
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

    for (const [agentType, agentSpec] of this.getAgentConfigEntries()) {
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
