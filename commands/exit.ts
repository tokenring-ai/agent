import Agent from "../Agent.ts";
import type {TokenRingAgentCommand} from "../types.ts";

const description = "/exit - Exit the current agent" as const;

export async function execute(_remainder: string | undefined, agent: Agent): Promise<void> {
  agent.infoLine("Exiting agent...");
  agent.requestExit();
}

const help: string = `# /exit

## Description
Gracefully exits the current agent session and returns you to the agent selection screen. This allows you to switch to a different agent or create a new one without restarting the entire CLI.

## Usage

/exit

## Behavior
- Sends a polite exit request to the current agent
- Returns you to the agent selection menu
- The agent will continue running in the background if it's designed to be persistent
- No data is lost - you can return to this agent later

## Examples

/exit                    # Exit current agent and return to selection

## Related Commands
- /quit    - Same as /exit (quits current agent)
- /switch  - Switch to a different agent without exiting

## Note
This is the recommended way to leave an agent session when you want to try a different agent or take a break.`;

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand;