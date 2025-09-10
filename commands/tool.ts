import joinDefault from "@tokenring-ai/utility/joinDefault";
import Agent from "../Agent.ts";

/**
 * Usage:
 *   /tools [enable|disable|set] <tool1> <tool2> ...
 *   /tools                 - shows interactive tool selection
 *   /tools enable foo bar  - enables foo and bar
 *   /tools disable baz     - disables baz
 *   /tools set a b c       - sets enabled tools to a, b, c
 */

export const description =
  "/tools [enable|disable|set] <tool1> <tool2> ... - List, enable, disable, or set enabled tools for the chat session." as const;

export async function execute(
  remainder: string | undefined,
  agent: Agent,
): Promise<void> {
  const availableTools = agent.tools.getAllItemNames();
  const activeTools = agent.tools.getActiveItemNames();

  // Handle direct tool operations, e.g. /tools enable foo bar
  const directOperation = remainder?.trim();
  if (directOperation) {
    const parts = directOperation.split(/\s+/);
    const operation = parts[0];
    const toolNames = parts.slice(1);

    if (!["enable", "disable", "set"].includes(operation)) {
      agent.errorLine(
        "Unknown operation. Usage: /tools [enable|disable|set] <tool1> <tool2> ...",
      );
      return;
    }

    switch (operation) {
      case "enable": {
        agent.tools.enableItems(...toolNames);
        break;
      }
      case "disable": {
        agent.tools.disableItems(...toolNames);
        break;
      }
      case "set": {
        agent.tools.setEnabledItems(toolNames);
        break;
      }
    }

    agent.infoLine(
      `Enabled tools: ${joinDefault(", ", agent.tools.getActiveItemNames(), "(none)")}`,
    );
    return;
  }


  const toolsByPackage: Record<string, string[]> = {};

  for (const [toolName, toolDef] of Object.entries(agent.tools.getAllItems())) {
    const packageName = toolDef.packageName || "unknown";
    if (!toolsByPackage[packageName]) {
      toolsByPackage[packageName] = [];
    }
    toolsByPackage[packageName].push(toolName);
  }

  for (const packageName in toolsByPackage) {
    toolsByPackage[packageName].sort((a, b) => a.localeCompare(b));
  }

  // Build tree structure for tool selection
  const buildToolTree = () => {
    const tree: any = {
      name: "Tool Selection",
      children: [],
    };
    const sortedPackages = Object.keys(toolsByPackage).sort((a, b) =>
      a.localeCompare(b),
    );

    for (const packageName of sortedPackages) {
      const tools = toolsByPackage[packageName];
      const children = tools.map((toolName) => ({
        name: `🔧 ${toolName}`,
        value: toolName,
      }));

      tree.children.push({
        name: `📦 ${packageName} (${tools.length} tools)`,
        value: `${packageName}/*`,
        hasChildren: true,
        children,
      });
    }

    return tree;
  };

  // Interactive tree selection if no operation is provided in the command
  try {
    const selectedTools = await agent.askHuman({
      type: "askForMultipleTreeSelection",
      message: `Current enabled tools: ${joinDefault(", ", activeTools, "(none)")}. Choose tools to enable:`,
        tree: buildToolTree(),
        initialSelection: activeTools,
      });

      if (selectedTools) {
        agent.tools.setEnabledItems(selectedTools);
        agent.infoLine(`Enabled tools: ${joinDefault(", ", agent.tools.getActiveItemNames(), "No tools selected.")}`);
      } else {
        agent.infoLine("Tool selection cancelled. No changes made.");
      }
  } catch (error) {
    agent.errorLine(`Error during tool selection:`, error as Error);
  }
}

// noinspection JSUnusedGlobalSymbols
export function help(): string[] {
  return [
    "/tools [enable|disable|set] <tool1> <tool2> ...",
    "  - With no arguments: Shows interactive tree selection for tools grouped by package",
    "  - enable: Enable specific tools",
    "  - disable: Disable specific tools",
    "  - set: Set exactly which tools are enabled",
  ];
}
