import Agent from "../Agent.ts";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/types";
import {ChatService} from "@tokenring-ai/chat";
import AgentManager from "../services/AgentManager.ts";

export default async function * getContextItems(input: string, chatConfig: ChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const chatService = agent.getServiceByType(ChatService);
  const agentManager = agent.requireServiceByType(AgentManager);
  if (chatService?.getEnabledTools(agent).includes("@tokenring-ai/agent/runAgent")) {
    const agentTypes = agentManager.getAgentConfigs();

    yield {
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
