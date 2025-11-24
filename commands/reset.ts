import Agent from "../Agent.ts";
import type {ResetWhat} from "../AgentEvents.js";
import {TokenRingAgentCommand} from "../types.ts";

const description =
  "/reset [chat|memory|settings|all]... - Clear chat state and/or memory and/or settings." as const;

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

// noinspection JSUnusedGlobalSymbols
function help(): string[] {
  return [
    "/reset [chat|memory|settings|all]...",
    "  - No arguments: resets chat state",
    "  - chat: resets chat state",
    "  - memory: resets memory items",
    "  - settings: resets settings to defaults",
    "  - all: resets chat, memory, and settings",
    "  - Multiple arguments can be specified (e.g., /reset chat memory)",
  ];
}
export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand
