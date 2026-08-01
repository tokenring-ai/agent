import { jsonBlock } from "@tokenring-ai/utility/string/codeBlock";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "../../types.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

function execute({ agent }: AgentCommandInputType<typeof inputSchema>): string {
  const checkpoint = agent.generateCheckpoint();

  return `### Agent Checkpoint Dump\n${jsonBlock(checkpoint)}`;
}

export default {
  name: "debug checkpoint",
  description: "Dumps the current state of the agent to the chat window",
  inputSchema,
  execute,
  help: "Dumps the current state of the agent to the chat window for debugging purposes.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
