import AgentManager from "../../services/AgentManager.ts";
import {
  AgentCommandInputSchema,
  AgentCommandInputType,
  TokenRingAgentCommand,
} from "../../types.ts";

const inputSchema = {
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const configs = agentManager.getAgentConfigEntries();

  return "**Available agent types:**\n" +
    Array.from(configs)
      .map(([type, config]) => `- **${type}**: ${config.description}`)
      .join("\n");
}

export default {
  name: "agent types",
  description: "List all available agent types",
  inputSchema,
  execute,
  help: "## /agent types\n\nLists all available agent types with their descriptions.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
