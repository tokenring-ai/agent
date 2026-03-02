import markdownList from "@tokenring-ai/utility/string/markdownList";
import Agent from "../../Agent.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.js";
import {TokenRingAgentCommand} from "../../types.ts";

export default {
  name: "hooks list",
  description: "/hooks list - List all registered hooks",
  help: `# /hooks list

List all hooks currently registered with the agent lifecycle service.

## Usage

/hooks list

## Example

/hooks list   # Prints all registered hook names`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const hookEntries = agent.requireServiceByType(AgentLifecycleService).getAllHookEntries();
    if (hookEntries.length === 0) return "No hooks are currently registered.";
    return `Registered hooks:\n${markdownList(hookEntries.map(([name]) => name))}`;
  },
} satisfies TokenRingAgentCommand;
