import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(_remainder: string, agent: Agent): Promise<string> {
  const checkpoint = agent.generateCheckpoint();

  return `### Agent Checkpoint Dump
\`\`\`json
${JSON.stringify(checkpoint, null, 2)}     
\`\`\`
`;
}

export default {
  name: "debug checkpoint",
  description: "/debug checkpoint - Dumps the current state of the agent to the chat window",
  execute,
  help: "## /debug checkpoint\n\nDumps the current state of the agent to the chat window for debugging purposes.",
} satisfies TokenRingAgentCommand;
