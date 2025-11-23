import {ChatService} from "@tokenring-ai/chat";
import {TokenRingService} from "@tokenring-ai/app/types";
import Agent from "../Agent.js";
import type {ContextItem} from "../types.js";
import AgentManager from "./AgentManager.js";

export default class AgentContextService implements TokenRingService {
  name = "AgentContextService";
  description = "Dispatches sub-agents to handle tasks";

  async* getContextItems(agent: Agent): AsyncGenerator<ContextItem> {
    const chatService = agent.getServiceByType(ChatService);
    const agentManager = agent.requireServiceByType(AgentManager);
    if (chatService?.getEnabledTools(agent).includes("@tokenring-ai/agent/runAgent")) {
      // Get the list of available agent types from the agent team
      const agentTypes = agentManager.getAgentConfigs();

      yield {
        position: "afterSystemMessage",
        role: "user",
        content:
          `/* The following agents can be run with the agent tool */` +
          Object.entries(agentTypes)
            .filter(([name, config]) => config.type === "background")
            .map(([name, config]) => `- ${name}: ${config.description}`)
            .join("\n"),
      };
    }
  }
}
