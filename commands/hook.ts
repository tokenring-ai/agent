import {Registry} from "@token-ring/registry";
import ChatService from "../ChatService.ts";

export const description =
  "/hooks [list|enable|disable] [hookName] - List registered hooks or enable/disable hook execution." as const;

export async function execute(
  remainder: string | undefined,
  registry: Registry,
): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);

  const registeredHooks = registry.hooks.getRegisteredHooks();

  const directOperation = remainder?.trim();
  if (directOperation) {
    const parts = directOperation.split(/\s+/);
    const operation = parts[0];
    const hookName = parts[1];

    switch (operation) {
      case "list": {
        if (registeredHooks.length === 0) {
          chatService.systemLine("No hooks are currently registered.");
        } else {
          chatService.systemLine("Registered hooks:");
          for (const hook of registeredHooks) {
            const enabled = registry.hooks.isHookEnabled(hook.name) ? "✓" : "✗";
            chatService.systemLine(`  ${enabled} ${hook}`);
          }
        }
        break;
      }
      case "enable": {
        if (!hookName) {
          chatService.errorLine(`Usage: /hooks enable <hookName>`);
          return;
        }
        if (registeredHooks.findIndex(hook => hook.name === hookName) === -1) {
          chatService.errorLine(`Unknown hook: ${hookName}`);
          return;
        }
        registry.hooks.enableHook(hookName);
        chatService.systemLine(`Hook '${hookName}' enabled`);
        break;
      }
      case "disable": {
        if (!hookName) {
          chatService.errorLine(`Usage: /hooks disable <hookName>`);
          return;
        }
        if (registeredHooks.findIndex(hook => hook.name === hookName) === -1) {
          chatService.errorLine(`Unknown hook: ${hookName}`);
          return;
        }
        registry.hooks.disableHook(hookName);
        chatService.systemLine(`Hook '${hookName}' disabled`);
        break;
      }
      default: {
        chatService.errorLine("Unknown operation. Usage: /hooks [list|enable|disable] [hookName]");
        return;
      }
    }
    return;
  }

  // Default: list all hooks
  if (registeredHooks.length === 0) {
    chatService.systemLine("No hooks are currently registered.");
  } else {
    chatService.systemLine("Registered hooks:");
    for (const hook of registeredHooks) {
      const enabled = registry.hooks.isHookEnabled(hook.name) ? "✓" : "✗";
      chatService.systemLine(`  ${enabled} ${hook}`);
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
