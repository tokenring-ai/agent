import {Agent} from "@tokenring-ai/agent";

export default async function execute(remainder: string, agent: Agent): Promise<void> {
  switch (remainder.trim()) {
    case 'throwError': {
      agent.infoMessage("Throwing an error in the chat handler....");
      throw new Error("This is an error thrown by the chat handler");
    } break;

    default:
      agent.errorMessage(`Unknown app debugging command: ${remainder}`);
  }
}
