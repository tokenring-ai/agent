import joinDefault from "@tokenring-ai/utility/string/joinDefault";
import Agent from "../Agent.ts";

export const description = "/settings - Show current chat settings." as const;

export function execute(_remainder: string | undefined, agent: Agent): void {
  const activeServices = agent.team.getServices();

  agent.infoLine("Current settings:");
  agent.infoLine(
    `Active services: ${joinDefault(
      ", ",
      activeServices.map((s) => s.name),
      "No services active.",
    )}`,
  );

  agent.infoLine("\nState:");
  agent.stateManager.forEach((slice) => {
    agent.infoLine(`\n${slice.name}:`);
    for (const line of slice.show()) {
      agent.infoLine(`  ${line}`);
    }
  });
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
