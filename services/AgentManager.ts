import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import type {AgentConfig, AgentStateSlice} from "../types.js";
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

  async spawnAgent(agentType: string): Promise<Agent> {
    return this.createAgent(this.agentConfigRegistry.requireItemByName(agentType));
  }


  async spawnSubAgent(agent: Agent, agentType: string): Promise<Agent> {
    const initialStateForSubAgent = Object.fromEntries(
      Object.entries(agent.stateManager).filter(item => item[1].persistToSubAgents)
    );

    const agentConfig = this.agentConfigRegistry.requireItemByName(agentType);
    // Create a new agent of the specified type
    const newAgent = await this.createAgent(agentConfig, initialStateForSubAgent);

    agent.systemMessage(
      `Created new agent: ${newAgent.config.name} (${formatAgentId(newAgent.id)})`,
    );
    return newAgent;
  }

  async createAgent(agentConfig: AgentConfig, initialState?: Record<string, AgentStateSlice>): Promise<Agent> {
    const agent = new Agent(this.app, agentConfig);

    this.agents.set(agent.id, agent);

    await agent.initialize(initialState); // Initialize the agent in the background
    return agent;
  }

  async deleteAgent(agent: Agent): Promise<void> {
    agent.requestAbort("AgentManager initiated shutdown");

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
      if (idleTimeout && agent.getIdleDuration() > idleTimeout * 1000) {
        try {
          await this.deleteAgent(agent);
          this.app.serviceOutput(`Agent ${agent.id} has been deleted due to inactivity.`);
        } catch (err) {
          this.app.serviceError(`Failed to delete idle agent ${agent.id}:`, err);
        }
      }
    }
  }
}
