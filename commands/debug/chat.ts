import type {AgentCommandInputSchema, TokenRingAgentCommand} from "../../types.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

function execute(): string {
  throw new Error("This is an error thrown by the chat handler");
}

export default {
  name: "debug chat throwError",
  description: "Throw an error in the chat handler",
  inputSchema,
  execute,
  help: "Throws an error in the chat handler to test error handling.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
