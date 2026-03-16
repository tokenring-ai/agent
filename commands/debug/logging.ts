import {Agent} from "@tokenring-ai/agent";
import {CommandFailedError} from "../../AgentError.ts";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const arg = remainder.trim().toLowerCase();

  if (arg === "on") {
    agent.debugEnabled = true;
    return "Debug logging enabled";
  } else if (arg === "off") {
    agent.debugEnabled = false;
    return "Debug logging disabled";
  } else {
    throw new CommandFailedError(`Invalid argument: ${arg}. Use 'on' or 'off'`);
  }
}

export default {
  name: "debug logging",
  description: "Enable or disable debug logging",
  execute,
  help: "## /debug logging on|off\n\nEnable or disable debug logging output.",
} satisfies TokenRingAgentCommand;
