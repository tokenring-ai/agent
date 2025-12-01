import Agent from "../Agent.ts";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/types";
import {ChatService} from "@tokenring-ai/chat";
import AgentManager from "../services/AgentManager.ts";

export default async function * getContextItems(input: string, chatConfig: ChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const agentTypes = agentManager.getAgentConfigs();

  yield {
    role: "user",
    content:
      '/* The following agents are available for use with agent & task planning tools */\n' +
      Object.entries(agentTypes)
        .filter(([name, config]) => config.callable)
        .map(([name, config]) => `- ${name}: ${config.description}`)
        .join("\n"),
  };
}
