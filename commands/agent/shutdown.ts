import AgentManager from "../../services/AgentManager.ts";
import {
  AgentCommandInputSchema,
  AgentCommandInputType,
  TokenRingAgentCommand,
} from "../../types.ts";

const inputSchema = {
  prompt: {
    description: "Optional agent id to shut down",
    required: false,
  },
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({prompt, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const id = prompt?.trim() || agent.id;
  const agentManager = agent.requireServiceByType(AgentManager);

  await agentManager.deleteAgent(id, "Agent was shut down with /agent shutdown command");
  return `Agent ${id} shut down.`;
}

export default {
  name: "agent shutdown",
  description: "Shut down an agent",
  inputSchema,
  execute,
  help: `## /agent shutdown [id]

Shuts down the current agent, or the agent with the given id.

### Examples
/agent shutdown
/agent shutdown <id>`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
