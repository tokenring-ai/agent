import Agent from "../../Agent.ts";
import AgentManager from "../../services/AgentManager.ts";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(_remainder: string, agent: Agent): Promise<string> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const configs = agentManager.getAgentConfigEntries();

  return "**Available agent types:**\n" +
    Array.from(configs)
      .map(([type, config]) => `- **${type}**: ${config.description}`)
      .join("\n");
}

export default {
  name: "agent types",
  description: "/agent types - List all available agent types",
  execute,
  help: "## /agent types\n\nLists all available agent types with their descriptions.",
} satisfies TokenRingAgentCommand;
