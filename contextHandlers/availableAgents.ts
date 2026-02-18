import {ContextItem, ParsedChatConfig} from "@tokenring-ai/chat/schema";
import Agent from "../Agent.ts";
import AgentManager from "../services/AgentManager.ts";
import {SubAgentState} from "../state/subAgentState.ts";

export default async function * getContextItems(input: string, chatConfig: ParsedChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const { allowedSubAgents } = agent.getState(SubAgentState);

  const allowedAgentTypes = agentManager.getAgentTypesLike(allowedSubAgents);

  if (allowedAgentTypes.length === 0) return;

  yield {
    role: "user",
    content:
      '/* The following agents are available for use with agent & task planning tools */\n' +
      allowedAgentTypes
        .map(([name, config]) => `- ${name}: ${config.description}`)
        .join("\n"),
  };
}
