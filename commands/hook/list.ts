import markdownList from "@tokenring-ai/utility/string/markdownList";
import Agent from "../../Agent.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.js";

export default async function list(_remainder: string, agent: Agent): Promise<string> {
  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);
  const hookEntries = agentLifecycleService.getAllHookEntries();

  if (hookEntries.length === 0) {
    return "No hooks are currently registered.";
  } else {
    const names = hookEntries.map(([name]) => name);
    return `Registered hooks:\n${markdownList(names)}`;
  }
}
