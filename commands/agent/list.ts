import Agent from "../../Agent.ts";
import AgentManager from "../../services/AgentManager.ts";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(_remainder: string, agent: Agent): Promise<string> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const agents = agentManager.getAgents();

  if (agents.length === 0) {
    return "No running agents.";
  }

  return "**Running agents:**\n" +
    agents.map(a => `- **${a.displayName}** (${a.id.slice(0, 8)}): ${a.config.description}`)
      .join("\n");
}

export default {
  name: "agent list",
  description: "/agent list - List all currently running agents",
  execute,
  help: "## /agent list\n\nLists all currently running agents.",
} satisfies TokenRingAgentCommand;
