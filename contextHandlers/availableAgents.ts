import {ContextItem, ParsedChatConfig} from "@tokenring-ai/chat/schema";
import Agent from "../Agent.ts";
import AgentManager from "../services/AgentManager.ts";

export default async function * getContextItems(input: string, chatConfig: ParsedChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const agentTypes = agentManager.getAgentConfigEntries();

  yield {
    role: "user",
    content:
      '/* The following agents are available for use with agent & task planning tools */\n' +
      Array.from(agentTypes).filter(([name, config]) => config.callable)
        .map(([name, config]) => `- ${name}: ${config.description}`)
        .join("\n"),
  };
}
