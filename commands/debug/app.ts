import {
  AgentCommandInputSchema,
  AgentCommandInputType,
  TokenRingAgentCommand,
} from "../../types.ts";

const inputSchema = {
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  setTimeout(() => agent.app.shutdown());
  return "Sending app shutdown command...";
}

export default {
  name: "debug app shutdown",
  description: "Send an abort command to the app",
  inputSchema,
  execute,
  help: "## /debug app shutdown\n\nSends an abort command to the app to test the shutdown handling.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
