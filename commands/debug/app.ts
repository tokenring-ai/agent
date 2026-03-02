import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(_remainder: string, agent: Agent): Promise<string> {
  setTimeout(() => agent.app.shutdown());
  return "Sending app shutdown command...";
}

export default {
  name: "debug app shutdown",
  description: "/debug app shutdown - Send an abort command to the app",
  execute,
  help: "## /debug app shutdown\n\nSends an abort command to the app to test the shutdown handling.",
} satisfies TokenRingAgentCommand;
