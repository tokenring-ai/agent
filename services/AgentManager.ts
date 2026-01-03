import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import {AgentCheckpointData, AgentConfig, AgentStateSlice} from "../types.js";
import {formatAgentId} from "../util/formatAgentId.js";

export default class AgentManager implements TokenRingService {
  name = "AgentManager";
  description = "A service which manages agent configurations and spawns agents.";
  private readonly app: TokenRingApp;
  private readonly cleanupCheckIntervalMs = 60000;

  constructor(app: TokenRingApp) {
    this.app = app;
    app.scheduleEvery(this.cleanupCheckIntervalMs, () => this.checkAndDeleteIdleAgents())
  }

  private agents: Map<string, Agent> = new Map();
  private agentConfigRegistry = new KeyedRegistry<AgentConfig>();

  addAgentConfig = this.agentConfigRegistry.register;
  getAgentConfigs = this.agentConfigRegistry.getAllItems;
  getAgentTypes = this.agentConfigRegistry.getAllItemNames;

  addAgentConfigs(agentConfigs: Record<string, AgentConfig>) {
    for (const agentName in agentConfigs) {
      this.addAgentConfig(agentName, agentConfigs[agentName]);
    }
  }


  async spawnAgentFromCheckpoint(checkpoint: AgentCheckpointData, { headless } : { headless: boolean }) {
    const agent = await Agent.createAgentFromCheckpoint(this.app, checkpoint, { headless });

    this.agents.set(agent.id, agent);

    return agent;
  }

  async spawnAgent({agentType, headless} : { agentType: string, headless: boolean}): Promise<Agent> {
    return this.spawnAgentFromConfig(this.agentConfigRegistry.requireItemByName(agentType), {headless});
  }

  async spawnAgentFromConfig(config: AgentConfig, {headless} : {headless: boolean}) {
    return this.createAgent({config, headless});
  }

  async spawnSubAgent(agent: Agent, {agentType, headless}: { agentType: string, headless: boolean}): Promise<Agent> {
    const agentConfig = this.agentConfigRegistry.requireItemByName(agentType);
    // Create a new agent of the specified type
    const newAgent = await this.createAgent({ config: agentConfig, headless});

    for (const [name, item] of newAgent.stateManager.entries()) {
      item?.transferStateFromParent?.(agent);
    }

    agent.systemMessage(
      `Created new agent: ${newAgent.config.name} (${formatAgentId(newAgent.id)})`,
    );
    return newAgent;
  }

  private async createAgent({config, initialState, headless}: {config: AgentConfig, headless: boolean, initialState?: Record<string, AgentStateSlice>}): Promise<Agent> {
    const agent = new Agent(this.app, {config, headless});

    this.agents.set(agent.id, agent);

    this.app.trackPromise(signal => agent.run(signal));

    return agent;
  }

  async deleteAgent(agent: Agent): Promise<void> {
    agent.shutdown('AgentManager initiated shutdown');
    this.agents.delete(agent.id);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | null {
    return this.agents.get(id) ?? null;
  }

  private async checkAndDeleteIdleAgents() {
    for (const agent of this.agents.values()) {
      const idleTimeout = agent.config.idleTimeout;
      const maxRunTime = agent.config.maxRunTime;
      if (idleTimeout && agent.getIdleDuration() > idleTimeout * 1000) {
        try {
          agent.shutdown(`Agent has been idle for ${agent.getIdleDuration() / 1000} seconds`);
          await this.deleteAgent(agent);
          this.app.serviceOutput(`Agent ${agent.id} has been deleted due to inactivity.`);
        } catch (err) {
          this.app.serviceError(`Failed to delete idle agent ${agent.id}:`, err);
        }
      } else if (maxRunTime && agent.getRunDuration() > maxRunTime * 1000) {
        try {
          agent.shutdown(`Agent has been running for ${agent.getRunDuration() / 1000} seconds`);
          await this.deleteAgent(agent);
          this.app.serviceOutput(`Agent ${agent.id} has been deleted due to max runtime.`);
        } catch (err) {
          this.app.serviceError(`Failed to delete agent ${agent.id} due to max runtime:`, err);
        }
      }
    }
  }
}
