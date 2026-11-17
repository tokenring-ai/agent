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
  /** Questions the agent is blocked on until a person answers them (approvals, choices, forms). */
  pendingQuestions: number;
  /** What the session is about: its first prompt to the model, shortened. Tells same-type agents apart. */
  title?: string;
  /** Set on sub-agents: the agent that started this one. */
  parentAgentId?: string;
};

export function projectAgentList(agents: Agent[]): AgentListEntry[] {
  return agents.map(agent => {
    const agentState = agent.getState(AgentEventState);
    const title = agentState.title?.text;
    return {
      id: agent.id,
      createdAt: agent.createdAt,
      agentType: agent.config.agentType,
      displayName: agent.displayName,
      description: agent.config.description,
      idle: agentState.idle,
      currentActivity: agentState.currentActivity,
      pendingQuestions:
        agentState.currentlyExecutingInputItem?.executionState.availableInteractions.filter(interaction => interaction.type === "question").length ?? 0,
      ...(title ? { title } : {}),
      ...(agent.parentAgentId ? { parentAgentId: agent.parentAgentId } : {}),
    };
  });
}
