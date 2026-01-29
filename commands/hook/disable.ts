import Agent from "../../Agent.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.js";

export default async function disable(remainder: string, agent: Agent): Promise<void> {
  const hookNames = remainder?.trim().split(/\s+/);

  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);

  agentLifecycleService.disableHooks(hookNames, agent);
  agent.infoMessage(`Disabled Hooks: ${hookNames.join(", ") || "(none)"}`);
}
