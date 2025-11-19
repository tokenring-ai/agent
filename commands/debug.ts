import Agent from "../Agent.ts";

export const description = "/debug [on|off] - Toggle debug logging." as const;

export function execute(remainder: string | undefined, agent: Agent): void {
  const arg = remainder?.trim().toLowerCase();

  if (!arg) {
    agent.infoLine(`Debug logging is currently ${agent.debugEnabled ? "enabled" : "disabled"}`);
    return;
  }

  if (arg === "on") {
    agent.debugEnabled = true;
    agent.infoLine("Debug logging enabled");
  } else if (arg === "off") {
    agent.debugEnabled = false;
    agent.infoLine("Debug logging disabled");
  } else {
    agent.errorLine("Usage: /debug [on|off]");
  }
}

export function help(): string[] {
  return [
    "/debug [on|off]",
    "  - No arguments: Show current debug logging status",
    "  - on: Enable debug logging",
    "  - off: Disable debug logging",
  ];
}
