import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import type {AgentConfig} from "../types.js";
import {formatAgentId} from "../util/formatAgentId.js";

export default class AgentManager implements TokenRingService {
  name = "AgentManager";
  description = "A service which manages agent configurations and spawns agents.";
  private app: TokenRingApp;

  constructor(app: TokenRingApp) {
    this.app = app;
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

  async spawnAgent(type: string): Promise<Agent> {
    const agentConfig = this.agentConfigRegistry.getItemByName(type);
    if (!agentConfig) {
      throw new Error(`[${this.name}] Couldn't find agent of type "${type}"`);
    }

    return this.createAgent(agentConfig);
  }


  async spawnSubAgent(agent: Agent, agentType: string): Promise<Agent> {
    // Create a new agent of the specified type
    const newAgent = await this.spawnAgent(agentType);

    agent.systemMessage(
      `Created new agent: ${newAgent.config.name} (${formatAgentId(newAgent.id)})`,
    );

    const initialStateForSubAgent = Object.fromEntries(
      Object.entries(agent.stateManager).filter(item => item[1].persistToSubAgents)
    );

    await newAgent.initialize(initialStateForSubAgent);

    return newAgent;
  }

  async createAgent(agentConfig: AgentConfig): Promise<Agent> {
    const agent = new Agent(this.app, agentConfig);

    this.agents.set(agent.id, agent);

    // noinspection ES6MissingAwait
    agent.initialize(); // Initialize the agent in the background
    return agent;
  }

  async deleteAgent(agent: Agent): Promise<void> {
    agent.requestAbort("AgentManager initiated shutdown");

    this.agents.delete(agent.id);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }
}
