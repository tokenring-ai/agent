import {Agent} from "@tokenring-ai/agent";

export default async function execute(remainder: string, agent: Agent): Promise<void> {
  switch (remainder.trim()) {
    case 'shutdown': {
      agent.infoMessage("Sending app shutdown command in 1 second...");
      setTimeout(async () => {
        agent.app.shutdown();
      })
    } break;
      
    default:
      agent.errorMessage(`Unknown app debugging command: ${remainder}`);
  }
}
