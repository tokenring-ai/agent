import type Agent from "../Agent.ts";
import { AgentEventState } from "../state/agentEventState.ts";

export type AgentListEntry = {
  id: string;
  createdAt: number;
  agentType: string;
  displayName: string;
  description: string;
  idle: boolean;
  currentActivity: string;
};

export function projectAgentList(agents: Agent[]): AgentListEntry[] {
  return agents.map(agent => {
    const agentState = agent.getState(AgentEventState);
    return {
      id: agent.id,
      createdAt: agent.createdAt,
      agentType: agent.config.agentType,
      displayName: agent.displayName,
      description: agent.config.description,
      idle: agentState.idle,
      currentActivity: agentState.currentActivity,
    };
  });
}
