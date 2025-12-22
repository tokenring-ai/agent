import joinDefault from "@tokenring-ai/utility/string/joinDefault";
import Agent from "../Agent.ts";
import {TokenRingAgentCommand} from "../types.ts";

const description = "/settings - Show current chat settings." as const;

export function execute(_remainder: string, agent: Agent): void {
  const activeServices = agent.app.getServices();

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

const help: string = `# /settings

## Description
Displays current agent settings and configuration state.

## Output includes
- Active services currently running
- State information from all state managers
- Configuration details and settings

## Usage
/settings

## Example output
Current settings:
Active services: AgentCommandService, LifecycleService

State:
ChatHistory:
  Messages: 42
  Current session: active
AgentConfig:
  Model: gpt-4
  Temperature: 0.7`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;