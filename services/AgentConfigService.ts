import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import type AgentTeam from "../AgentTeam.js";
import type {AgentConfig, TokenRingService} from "../types.js";
import {formatAgentId} from "../util/formatAgentId.js";

export default class AgentConfigService implements TokenRingService {
  name = "AgentConfigService";
  description = "A service which stores agent configurations and spawns agents.";

  private agentConfigRegistry = new KeyedRegistry<AgentConfig>();

  addAgentConfig = this.agentConfigRegistry.register;
  getAgentConfigs = this.agentConfigRegistry.getAllItems;
  getAgentTypes = this.agentConfigRegistry.getAllItemNames;

  addAgentConfigs(agentConfigs: Record<string, AgentConfig>) {
    for (const agentName in agentConfigs) {
      this.addAgentConfig(agentName, agentConfigs[agentName]);
    }
  }

  async spawnAgent(type: string, agentTeam: AgentTeam): Promise<Agent> {
    const agentConfig = this.agentConfigRegistry.getItemByName(type);
    if (!agentConfig) {
      throw new Error(`[${this.name}] Couldn't find agent of type "${type}"`);
    }

    return agentTeam.createAgent(agentConfig);
  }


  async spawnSubAgent(agent: Agent, agentType: string): Promise<Agent> {
    // Create a new agent of the specified type
    const newAgent = await this.spawnAgent(agentType, agent.team);

    agent.systemMessage(
      `Created new agent: ${newAgent.options.name} (${formatAgentId(newAgent.id)})`,
    );

    const initialStateForSubAgent = Object.fromEntries(
      Object.entries(agent.stateManager).filter(item => item[1].persistToSubAgents)
    );

    await newAgent.initialize(initialStateForSubAgent);

    return newAgent;
  }
}
