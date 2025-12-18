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
  remainder: string | undefined,
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
        agentLifecycleService.enableHooks([hookName], agent);
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
        agentLifecycleService.disableHooks([hookName], agent);
        agent.infoLine(`Hook '${hookName}' disabled`);
        break;
      }
      default: {
        agent.errorLine(
          "Unknown operation. Usage: /hooks [list|enable|disable] [hookName]",
        );
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

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand