import markdownList from "@tokenring-ai/utility/string/markdownList";
import Agent from "../Agent.ts";
import AgentLifecycleService from "../services/AgentLifecycleService.js";
import {TokenRingAgentCommand} from "../types.ts";

const description =
  "/hooks - List registered hooks or enable/disable hook execution." as const;

const help: string = `# /hooks

## Description
Manage registered hooks and their execution state. Hooks are special functions that can be triggered during agent lifecycle events.

## Commands
- **list** - Lists all registered hooks
- **enable <hookName>** - Enables hook execution
- **disable <hookName>** - Disables hook execution

## Usage examples
/hooks                    # Lists all registered hooks
/hooks list               # Lists all registered hooks
/hooks enable preProcess  # Enables the preProcess hook
/hooks disable postProcess # Disables the postProcess hook

## Hook types typically include
- **preProcess**: Runs before agent processing
- **postProcess**: Runs after agent processing
- **onMessage**: Runs when a new message is received
- **onStateChange**: Runs when agent state changes
- **custom**: User-defined hooks

## Notes
- Hook names are case-sensitive
- Use /hooks list to see available hooks
- Disabled hooks are not executed but remain registered`;

async function execute(
  remainder: string,
  agent: Agent,
): Promise<void> {
  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);
  const registeredHooks = agentLifecycleService.getRegisteredHooks();

  const directOperation = remainder?.trim();
  if (directOperation) {
    const parts = directOperation.split(/\s+/);
    const operation = parts[0];
    const hookName = parts[1];

    switch (operation) {
      case "list": {
        const hookEntries = Object.entries(registeredHooks);
        const lines: string[] = [];
        if (hookEntries.length === 0) {
          lines.push("No hooks are currently registered.");
        } else {
          lines.push("Registered hooks:");
          const names = hookEntries.map(([name]) => name);
          lines.push(markdownList(names));
        }
        agent.infoMessage(lines.join("\n"));
        break;
      }
      case "enable": {
        if (!hookName) {
          agent.errorMessage(`Usage: /hooks enable <hookName>`);
          return;
        }
        if (!registeredHooks[hookName]) {
          agent.errorMessage(`Unknown hook: ${hookName}`);
          return;
        }
        agentLifecycleService.enableHooks([hookName], agent);
        agent.infoMessage(`Hook '${hookName}' enabled`);
        break;
      }
      case "disable": {
        if (!hookName) {
          agent.errorMessage(`Usage: /hooks disable <hookName>`);
          return;
        }
        if (!registeredHooks[hookName]) {
          agent.errorMessage(`Unknown hook: ${hookName}`);
          return;
        }
        agentLifecycleService.disableHooks([hookName], agent);
        agent.infoMessage(`Hook '${hookName}' disabled`);
        break;
      }
      default: {
        agent.errorMessage(
          "Unknown operation. Usage: /hooks [list|enable|disable] [hookName]",
        );
        return;
      }
    }
    return;
  }

  // Default: list all hooks
  const hookEntries = Object.entries(registeredHooks);
  const lines: string[] = [];
  if (hookEntries.length === 0) {
    lines.push("No hooks are currently registered.");
  } else {
    lines.push("Registered hooks:");
    const names = hookEntries.map(([name]) => name);
    lines.push(markdownList(names));
  }
  agent.infoMessage(lines.join("\n"));
}

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand