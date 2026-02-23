import {Agent} from "@tokenring-ai/agent";
import {CommandFailedError} from "../../AgentError.ts";

export default async function execute(remainder: string, agent: Agent): Promise<string> {
  switch (remainder.trim()) {
    case 'throwError': {
      throw new Error("This is an error thrown by the chat handler");
    }

    default:
      throw new CommandFailedError(`Unknown app debugging command: ${remainder}`);
  }
}
