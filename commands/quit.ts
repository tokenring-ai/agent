import {TokenRingAgentCommand} from "../types.ts";

const description = "/quit - Quit the current agent" as const;

import {execute} from "./exit.ts";

const help: string = `# /quit

## Description
Gracefully quits the current agent session and returns you to the agent selection screen where you can choose a different agent or create a new one.

## Usage

/quit

## Examples

/quit                    # Quit current agent and return to selection

## Note
This is equivalent to /exit. Use either command to leave the current agent session.`;

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand;