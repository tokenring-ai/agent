import joinDefault from "@tokenring-ai/utility/string/joinDefault";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import Agent from "../Agent.ts";
import {TokenRingAgentCommand} from "../types.ts";

const description = "/settings - Show current chat settings." as const;

export function execute(_remainder: string, agent: Agent): void {
  const activeServices = agent.app.getServices();

  const lines: string[] = [
    "Current settings:",
    `Active services: ${joinDefault(", ", activeServices.map((s) => s.name), "No services active.")}`,
    "",
    "State:",
  ];
  agent.stateManager.forEach((slice) => {
    lines.push(`\n***${slice.name}***:`);
    const sliceLines = slice.show();
    lines.push(markdownList(sliceLines));
  });

  agent.infoMessage(lines.join("\n"));
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