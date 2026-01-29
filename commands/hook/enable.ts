import Agent from "../../Agent.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.js";

export default async function enable(remainder: string, agent: Agent): Promise<void> {
  const hookNames = remainder?.trim().split(/\s+/);

  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);

  agentLifecycleService.enableHooks(hookNames, agent);
  agent.infoMessage(`Enabled Hooks: ${hookNames.join(", ") || "(none)"}`);
}
