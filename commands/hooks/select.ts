import Agent from "../../Agent.ts";
import type {TreeLeaf} from "../../question.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.js";
import {TokenRingAgentCommand} from "../../types.ts";

export default {
  name: "hooks select",
  description: "/hooks select - Interactive hook selection",
  help: `# /hooks select

Open an interactive tree-based selector to choose which hooks to enable.

## Usage

/hooks select

## Example

/hooks select   # Opens the interactive hook selection UI

## Notes

- Only available in interactive (non-headless) mode
- Selection replaces the current enabled hooks`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);
    const hookNames = agentLifecycleService.getAllHookNames();

    if (hookNames.length === 0) return "No hooks are currently registered.";

    const hookTree: TreeLeaf[] = [{
      name: `Registered Hooks (${hookNames.length})`,
      children: hookNames.sort().map(name => ({ value: name, name })),
    }];

    const selection = await agent.askQuestion({
      message: "Select a hook:",
      question: { type: "treeSelect", label: "Hook Selection", key: "result", tree: hookTree },
    });

    if (selection) {
      agentLifecycleService.setEnabledHooks(selection, agent);
      return `Selected hook: ${selection.join(", ") || "(none)"}`;
    }
    return "Hook selection cancelled.";
  },
} satisfies TokenRingAgentCommand;