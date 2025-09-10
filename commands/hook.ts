import Agent from "../Agent.ts";

export const description =
  "/hooks [list|enable|disable] [hookName] - List registered hooks or enable/disable hook execution." as const;

export async function execute(
  remainder: string | undefined,
  agent: Agent,
): Promise<void> {
  const registeredHooks = agent.hooks.getAllItems();

  const directOperation = remainder?.trim();
  if (directOperation) {
    const parts = directOperation.split(/\s+/);
    const operation = parts[0];
    const hookName = parts[1];

    switch (operation) {
      case "list": {
        const hookEntries = Object.entries(registeredHooks);
        if (hookEntries.length === 0) {
          agent.infoLine("No hooks are currently registered.");
        } else {
          agent.infoLine("Registered hooks:");
          for (const [name, hook] of hookEntries) {
            agent.infoLine(`  ${name}`);
          }
        }
        break;
      }
      case "enable": {
        if (!hookName) {
          agent.errorLine(`Usage: /hooks enable <hookName>`);
          return;
        }
        if (!registeredHooks[hookName]) {
          agent.errorLine(`Unknown hook: ${hookName}`);
          return;
        }
        agent.infoLine(`Hook '${hookName}' enabled`);
        break;
      }
      case "disable": {
        if (!hookName) {
          agent.errorLine(`Usage: /hooks disable <hookName>`);
          return;
        }
        if (!registeredHooks[hookName]) {
          agent.errorLine(`Unknown hook: ${hookName}`);
          return;
        }
        agent.infoLine(`Hook '${hookName}' disabled`);
        break;
      }
      default: {
        agent.errorLine("Unknown operation. Usage: /hooks [list|enable|disable] [hookName]");
        return;
      }
    }
    return;
  }

  // Default: list all hooks
  const hookEntries = Object.entries(registeredHooks);
  if (hookEntries.length === 0) {
    agent.infoLine("No hooks are currently registered.");
  } else {
    agent.infoLine("Registered hooks:");
    for (const [name, hook] of hookEntries) {
      agent.infoLine(`  ${name}`);
    }
  }
}

// noinspection JSUnusedGlobalSymbols
export function help(): string[] {
  return [
    "/hooks [list|enable|disable] [hookName]",
    "  - With no arguments: Lists all registered hooks with enabled status",
    "  - list: Lists all registered hooks with callback counts and enabled status",
    "  - enable <hookName>: Enable hook execution",
    "  - disable <hookName>: Disable hook execution",
  ];
}
