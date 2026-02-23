import {Agent} from "@tokenring-ai/agent";
import {CommandFailedError} from "../../AgentError.ts";

export default async function execute(remainder: string, agent: Agent): Promise<string> {
  switch (remainder.trim()) {
    case 'shutdown': {
      setTimeout(async () => {
        agent.app.shutdown();
      })
      return "Sending app shutdown command in 1 second...";
    }
      
    default:
      throw new CommandFailedError(`Unknown app debugging command: ${remainder}`);
  }
}
