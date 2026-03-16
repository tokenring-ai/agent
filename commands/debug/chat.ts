import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(remainder: string, _agent: Agent): Promise<string> {
  throw new Error("This is an error thrown by the chat handler");
}

export default {
  name: "debug chat throwError",
  description: "Throw an error in the chat handler",
  execute,
  help: "## /debug chat throwError\n\nThrows an error in the chat handler to test error handling.",
} satisfies TokenRingAgentCommand;
