import Agent from "../Agent.ts";
import {CostTrackingState} from "../state/costTrackingState.ts";
import {TokenRingAgentCommand} from "../types.ts";

const description = "/cost - Displays total costs incurred by the Agent." as const;
export function execute(remainder: string | undefined, agent: Agent): void {
  const lines = agent.getState(CostTrackingState).show();

  agent.chatOutput(lines.join("\n"));
}

const help: string = `# /costs

## Description
Displays total costs incurred by the Agent, including AI Chat, Image Generation, and Web Search costs.

## Commands
- **(no argument)** - Shows total costs incurred by the Agent

## Notes
- Costs are summed from the beginning of the current session until the current time
- Costs are displayed in USD
`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;
