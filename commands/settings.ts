import joinDefault from "@tokenring-ai/utility/joinDefault";
import Agent from "../Agent.ts";

export const description = "/settings - Show current chat settings." as const;

export function execute(_remainder: string | undefined, agent: Agent): void {
  const activeServices = agent.team.services.getItems()
  const activeTools = agent.tools.getActiveItemNames();

  agent.infoLine("Current settings:");
  agent.infoLine(
    `Active services: ${joinDefault(", ", activeServices.map(s => s.name), "No services active.")}`
  );
  agent.infoLine(
    `Active tools: ${joinDefault(", ", activeTools, "No tools enabled.")}`
  );
}

// noinspection JSUnusedGlobalSymbols
export function help(): string[] {
  return [
    "/settings",
    "  - Show current chat settings, including:",
    "  - Active services",
    "  - Active tools",
  ];
}
