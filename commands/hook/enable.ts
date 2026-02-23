import Agent from "../../Agent.ts";
import AgentLifecycleService from "../../services/AgentLifecycleService.js";

export default async function enable(remainder: string, agent: Agent): Promise<string> {
  const hookNames = remainder?.trim().split(/\s+/);

  const agentLifecycleService = agent.requireServiceByType(AgentLifecycleService);

  agentLifecycleService.enableHooks(hookNames, agent);
  return `Enabled Hooks: ${hookNames.join(", ") || "(none)"}`;
}
