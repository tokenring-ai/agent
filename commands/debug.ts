import convertBoolean from "@tokenring-ai/utility/string/convertBoolean";
import Agent from "../Agent.ts";
import {TokenRingAgentCommand} from "../types.ts";

const description = "/debug [on|off] - Toggle debug logging." as const;


export function execute(remainder: string | undefined, agent: Agent): void {
  const arg = remainder?.trim().toLowerCase();

  if (!arg) {
    agent.infoLine(`Debug logging is currently ${agent.debugEnabled ? "enabled" : "disabled"}`);
    return;
  }

  agent.debugEnabled = convertBoolean(arg);
}

function help(): string[] {
  return [
    "/debug [on|off]",
    "  - No arguments: Show current debug logging status",
    "  - on: Enable debug logging",
    "  - off: Disable debug logging",
  ];
}

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand