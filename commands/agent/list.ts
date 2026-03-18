import AgentManager from "../../services/AgentManager.ts";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../../types.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
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
  description: "List all currently running agents",
  inputSchema,
  execute,
  help: "## /agent list\n\nLists all currently running agents.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
