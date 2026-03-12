import Agent from "../../Agent.ts";
import {CommandFailedError} from "../../AgentError.ts";
import {runSubAgent} from "../../runSubAgent.ts";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const isBg = remainder.includes("--bg");
  const input = remainder.replace("--bg", "").trim();

  if (!input) {
    throw new CommandFailedError("Usage: /agent run [--bg] <agentType> <message>");
  }

  const parts = input.split(/\s+/);
  const agentType = parts[0];
  const message = parts.slice(1).join(" ");

  if (!message) {
    throw new CommandFailedError("Please provide a message for the agent");
  }

  await runSubAgent({
    agentType,
    background: isBg,
    headless: agent.headless,
    input: {
      from: "Parent agent command: /agent run",
      message: `/work ${message}`,
    }
  }, agent, true);

  return isBg ? "Agent started in background." : "Sub-agent completed successfully.";
}

export default {
  name: "agent run",
  description: "/agent run - Run an agent with a message",
  execute,
  help: `## /agent run [--bg] <agentType> <message>

Runs an agent of the specified type with the given message.
- Use --bg flag to run in background without forwarding output

### Examples
/agent run leader analyze the codebase
/agent run --bg researcher find information about AI`,
} satisfies TokenRingAgentCommand;
