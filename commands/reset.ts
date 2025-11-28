import Agent from "../Agent.ts";
import type {ResetWhat} from "../AgentEvents.js";
import {TokenRingAgentCommand} from "../types.ts";

const description =
  "/reset - Clear chat state and/or memory and/or settings." as const;

export function execute(remainder: string | undefined, agent: Agent): void {
  // Parse arguments
  let args = remainder?.trim().split(/\s+/) || [];

  // Default behavior: reset chat if no args provided
  if (args.length === 0) {
    args = ["chat"];
  }

  // Generalized handling of arguments with support for 'settings' and 'all'
  const validTargets = new Set(["chat", "memory", "settings"]);
  const toClear = new Set<string>();
  const unknownArgs: string[] = [];

  for (const raw of args) {
    const arg = raw.toLowerCase();
    if (arg === "all") {
      for (const t of validTargets) toClear.add(t);
      continue;
    }
    if (validTargets.has(arg)) {
      toClear.add(arg);
      continue;
    }
    unknownArgs.push(raw);
  }

  if (unknownArgs.length > 0) {
    for (const u of unknownArgs) {
      agent.errorLine(`Unknown argument: ${u}`);
    }
    agent.errorLine("Valid arguments are: chat, memory, settings, all");
    return;
  }

  if (toClear.size > 0) {
    agent.reset(Array.from(toClear) as ResetWhat[]);
    agent.infoLine(`Reset ${Array.from(toClear).join(", ")}`);
  }
}

const help: string = `# /reset

## Description
Clears various aspects of agent state. Multiple targets can be specified.

## Available targets
- **chat** - Resets chat history and conversation state
- **memory** - Clears memory items and cached data
- **settings** - Resets configuration to default values
- **all** - Resets everything (chat, memory, and settings)

## Usage examples
/reset                    # Resets chat only (default)
/reset chat               # Resets chat history
/reset memory             # Clears memory items
/reset settings           # Resets settings to defaults
/reset all                # Resets everything
/reset chat memory        # Resets both chat and memory
/reset chat memory settings  # Resets all three

## Notes
- No arguments defaults to 'chat' only
- Multiple arguments can be combined
- Use 'all' to reset everything at once`;

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand;