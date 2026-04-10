import type {AgentCommandInputSchema, TokenRingAgentCommand} from "../../types.ts";

// @ts-expect-error - This is a markdown file
import markdownSample from "./markdown.sample.md" with {type: "text"};

const inputSchema = {} as const satisfies AgentCommandInputSchema;

function execute(): string {
  return markdownSample as string;
}

export default {
  name: "debug markdown",
  description: "Output a markdown sample",
  inputSchema,
  execute,
  help: `Output a markdown sample to test console rendering.`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
