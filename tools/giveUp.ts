import type {TokenRingToolDefinition, TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import type Agent from "../Agent.ts";

const name = "give_up";
const displayName = "Agent/Give Up";

const description =
  "Call this tool when you are unable to complete the assigned task, or when the task violates your guidelines, or when you have encountered an unrecoverable error." +
  "Provide a clear explanation of why the work cannot be finished.";

const inputSchema = z.object({
  reason: z
    .string()
    .describe("A detailed explanation of why the task cannot be completed."),
});

export function execute(
  {reason}: z.output<typeof inputSchema>,
  agent: Agent,
): TokenRingToolResult {
  agent.abortCurrentOperation(`Agent decided to call the give_up tool, indicating that the task could not be completed.
Reason: ${reason}`);
  return `Immediately stop what you are doing, and wait for input from the user on what to do next.`;
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;