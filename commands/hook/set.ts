import Agent from "../../Agent.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.ts";

export default async function set(remainder: string, agent: Agent): Promise<string> {
  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);
  const hookNames = remainder?.trim().split(/\s+/);

  agentLifecycleService.setEnabledHooks(hookNames,agent);
  return `Selected hooks: ${hookNames.join(", ") || "(none)"}`;
}
