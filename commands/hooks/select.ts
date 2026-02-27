import Agent from "../../Agent.ts";
import type {TreeLeaf} from "../../question.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.js";

export default async function select(_remainder: string, agent: Agent): Promise<string> {
  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);
  const hookNames = agentLifecycleService.getAllHookNames();

  if (hookNames.length === 0) {
    return "No hooks are currently registered."
  }

  const hookTree: TreeLeaf[] = [
    {
      name: `Registered Hooks (${hookNames.length})`,
      children: hookNames.sort().map((name) => ({
        value: name,
        name: name,
      })),
    },
  ];

  const selection = await agent.askQuestion({
    message: "Select a hook:",
    question: {
      type: "treeSelect",
      label: "Hook Selection",
      key: "result",
      tree: hookTree,
    },
  });

  if (selection) {
    agentLifecycleService.setEnabledHooks(selection,agent);
    return `Selected hook: ${selection.join(", ") || "(none)"}`;
  } else {
    return "Hook selection cancelled.";
  }
}