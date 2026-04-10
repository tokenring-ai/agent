import AgentManager from "../../services/AgentManager.ts";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../../types.ts";

const inputSchema = {
  positionals: [
    {
      name: "agentId",
      description: "Optional agent id to shut down",
      required: false,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({
                         positionals,
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const agentId = positionals.agentId ?? agent.id;
  const agentManager = agent.requireServiceByType(AgentManager);

  await agentManager.deleteAgent(
    agentId,
    "Agent was shut down with /agent shutdown command",
  );
  return `Agent ${agentId} shut down.`;
}

export default {
  name: "agent shutdown",
  description: "Shut down an agent",
  inputSchema,
  execute,
  help: `Shuts down the current agent, or the agent with the given id.

### Examples
/agent shutdown
/agent shutdown <agentId>`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
