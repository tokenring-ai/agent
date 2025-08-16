import {Registry} from "@token-ring/registry";
import ChatService from "../ChatService.ts";
import HumanInterfaceService from "../HumanInterfaceService.ts";

/**
 * Usage:
 *   /resources [enable|disable|set] <resource1> <resource2> ...
 *   /resources                 - shows interactive resource selection
 *   /resources enable foo bar  - enables foo and bar
 *   /resources disable baz     - disables baz
 *   /resources set a b c       - sets enabled resources to a, b, c
 */

export const description =
  "/resources [enable|disable|set] <resource1> <resource2> ... - List, enable, disable, or set enabled resources for the chat session." as const;

export async function execute(
  remainder: string | undefined,
  registry: Registry,
): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const humanInterfaceService = registry.getFirstServiceByType(
    HumanInterfaceService,
  );

  const availableResources: string[] = registry.resources.getAvailableResourceNames();
  const activeResources: string[] = registry.resources.getEnabledResourceNames();

  // Handle direct resource operations, e.g. /resources enable foo bar
  const directOperation = remainder?.trim();
  if (directOperation) {
    const parts = directOperation.split(/\s+/);
    const operation = parts[0];
    const resourceNames = parts.slice(1);

    if (!["enable", "disable", "set"].includes(operation)) {
      chatService.errorLine(
        "Unknown operation. Usage: /resources [enable|disable|set] <resource1> <resource2> ...",
      );
      return;
    }

    // Validate resource names
    for (const name of resourceNames) {
      if (!availableResources.includes(name)) {
        // If we are disabling, it's okay if it's in activeResources even if not in available
        if (operation === "disable" && activeResources.includes(name)) {
          // This is fine, we are disabling an active resource
        } else {
          chatService.errorLine(`Unknown resource: ${name}`);
          return;
        }
      }
    }

    switch (operation) {
      case "enable": {
        let changed = false;
        for (const name of resourceNames) {
          if (activeResources.includes(name)) {
            chatService.systemLine(`Resource '${name}' is already enabled.`);
          } else if (availableResources.includes(name)) {
            await registry.resources.enableResources(name);
            changed = true;
            chatService.systemLine(`Enabled resource: ${name}`);
          } else {
            chatService.errorLine(`Unknown resource: ${name}`);
          }
        }
        if (!changed) chatService.systemLine("No resources were enabled.");
        break;
      }
      case "disable": {
        let changed = false;
        for (const name of resourceNames) {
          if (activeResources.includes(name)) {
            await registry.resources.disableResources(name);
            changed = true;
            chatService.systemLine(`Disabled resource: ${name}`);
          } else {
            chatService.systemLine(`Resource '${name}' was not enabled.`);
          }
        }
        if (!changed) chatService.systemLine("No resources were disabled.");
        break;
      }
      case "set": {
        await registry.resources.setEnabledResources(...resourceNames);
        chatService.systemLine(
          `Set enabled resources: ${resourceNames.join(" ")}`,
        );
        break;
      }
    }

    chatService.systemLine(
      "Current enabled resources: " +
      (registry.resources.getEnabledResourceNames().join(" ") || "none"),
    );
    return;
  }

  // If no remainder provided, show interactive multi-selection
  const sortedResources = availableResources.sort((a, b) => a.localeCompare(b));

  // Interactive multi-selection if no operation is provided in the command
  try {
    const selectedResources = await humanInterfaceService?.askForMultipleTreeSelection({
      message: `Current enabled resources: ${activeResources.join(", ") || "none"}. Choose resources to enable:`,
      tree: {
        name: "Resource Selection",
        children: buildResourceTree(sortedResources),
      },
      allowCancel: true,
      initialSelection: activeResources,
    });

    if (selectedResources) {
      await registry.resources.setEnabledResources(...selectedResources);
      chatService.systemLine(
        `Set enabled resources: ${selectedResources.join(", ")}`,
      );
    } else {
      chatService.systemLine("Resource selection cancelled. No changes made.");
    }
  } catch (error) {
    chatService.errorLine(`Error during resource selection:`, error);
  }
}

export function help(): string[] {
  return [
    "/resources [enable|disable|set] <resource1> <resource2> ...",
    "  - With no arguments: Shows interactive multi-selection for resources",
    "  - enable: Enable specific resources",
    "  - disable: Disable specific resources",
    "  - set: Set exactly which resources are enabled",
  ];
}

function buildResourceTree(resourceNames: string[]) {
  const children: any[] = [];

  for (const resourceName of resourceNames) {
    const segments = resourceName.split("/");
    let leaf: any[] = children;
    for (let i = 0; i < segments.length; i++) {
      if (i === segments.length - 1) {
        leaf.push({
          name: segments[i],
          value: resourceName,
        });
      } else {
        let child: any = leaf.find(
          (c) => c.name === segments[i] && c.children != null,
        );
        if (!child) {
          child = {
            name: segments[i],
            value: `${segments.slice(0, i + 1).join("/")}/*`,
            children: [],
          };
          leaf.push(child);
        }
        if (!child.children) child.children = [];
        leaf = child.children;
      }
    }
  }
  return children;
}
