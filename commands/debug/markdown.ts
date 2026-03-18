import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../../types.ts";

// @ts-ignore
import markdownSample from './markdown.sample.md' with {type: 'text'};

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  return markdownSample;
}

export default {
  name: "debug markdown",
  description: "Output a markdown sample",
  inputSchema,
  execute,
  help: `Output a markdown sample to test console rendering.`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
