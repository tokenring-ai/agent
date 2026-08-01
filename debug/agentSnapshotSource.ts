import type TokenRingApp from "@tokenring-ai/app";
import type { DebugSnapshotSource, DebugTarget } from "@tokenring-ai/app";
import formatError from "@tokenring-ai/utility/error/formatError";
import type Agent from "../Agent.ts";
import AgentManager from "../services/AgentManager.ts";
import { AgentEventState } from "../state/agentEventState.ts";
import { formatAgentId } from "../util/formatAgentId.ts";

/**
 * Exposes every running agent to the debugger, so a snapshot of one agent's
 * state manager can be captured alongside app-level snapshots.
 */
export function createAgentSnapshotSource(app: TokenRingApp): DebugSnapshotSource {
  return {
    kind: "agent",
    displayName: "Agents",

    listTargets(): DebugTarget[] {
      return app
        .requireService(AgentManager)
        .getAgents()
        .map(agent => {
          const eventState = agent.getState(AgentEventState);
          return {
            kind: "agent",
            id: agent.id,
            label: `${agent.displayName} (${formatAgentId(agent.id)})`,
            description: eventState.idle ? "Idle" : eventState.currentActivity,
          };
        });
    },

    captureTarget(id: string): unknown {
      const agent = app.requireService(AgentManager).getAgent(id);
      return agent ? captureAgentState(agent) : undefined;
    },
  };
}

/** Dumps an agent's state manager plus the runtime context needed to read it. */
function captureAgentState(agent: Agent): Record<string, unknown> {
  const eventState = agent.getState(AgentEventState);

  return {
    agentId: agent.id,
    displayName: agent.displayName,
    agentType: agent.config.agentType,
    createdAt: agent.createdAt,
    headless: agent.headless,
    debugEnabled: agent.debugEnabled,
    status: eventState.status,
    idle: eventState.idle,
    currentActivity: eventState.currentActivity,
    idleDurationMs: agent.getIdleDuration(),
    runDurationMs: agent.getRunDuration(),
    inputQueue: eventState.inputQueue.map(item => ({
      requestId: item.request.requestId,
      currentActivity: item.executionState.currentActivity,
      availableInteractions: item.executionState.availableInteractions,
      aborted: item.abortController.signal.aborted,
    })),
    config: agent.config,
    state: serializeAgentState(agent),
  };
}

/**
 * Serializes each slice on its own so a slice that fails to serialize is
 * reported in place rather than losing the whole snapshot.
 */
function serializeAgentState(agent: Agent): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const slice of agent.stateManager.slices()) {
    try {
      serialized[slice.name] = slice.serialize();
    } catch (error) {
      serialized[slice.name] = { __serializationError: formatError(error, { includeStack: false }) };
    }
  }
  return serialized;
}
