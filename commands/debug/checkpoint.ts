import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "../../types.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

function execute({ agent }: AgentCommandInputType<typeof inputSchema>): string {
  const checkpoint = agent.generateCheckpoint();

  return `### Agent Checkpoint Dump
\`\`\`json
${JSON.stringify(checkpoint, null, 2)}     
\`\`\`
`;
}

export default {
  name: "debug checkpoint",
  description: "Dumps the current state of the agent to the chat window",
  inputSchema,
  execute,
  help: "Dumps the current state of the agent to the chat window for debugging purposes.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
