import Agent from "../../Agent.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.ts";

export default async function set(remainder: string, agent: Agent): Promise<void> {
  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);
  const hookNames = remainder?.trim().split(/\s+/);

  agent.infoMessage(`Selected hooks: ${hookNames.join(", ") || "(none)"}`);
  agentLifecycleService.setEnabledHooks(hookNames,agent);
}
