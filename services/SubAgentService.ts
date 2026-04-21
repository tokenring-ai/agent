import type Agent from "@tokenring-ai/agent/Agent";
import type { InputMessage, ParsedInteractionRequest } from "@tokenring-ai/agent/AgentEvents";
import type { ParsedSubAgentConfig } from "@tokenring-ai/agent/schema";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";
import { AgentEventState, agentMessages } from "../state/agentEventState.ts";

export type SubAgentStep = string | Pick<InputMessage, "message" | "attachments">;

export type RunSubAgentOptions = {
  /** The type of agent to create */
  agentType: string;
  /** Whether to run the agent in the background and return immediately (default: false) */
  background?: boolean | undefined;
  /** Whether to run the agent in headless mode */
  headless: boolean;
  /** The source of the input */
  from: string;
  /** Runtime options for the agent */
  options: ParsedSubAgentConfig;
  /** The parent agent instance */
  parentAgent: Agent;
  /** Whether to automatically clean up the child agent when done */
  autoCleanup?: boolean | undefined;
  /** The command to send to the agent */
  steps: SubAgentStep[];
};

export interface RunSubAgentResult {
  /** Status of the agent execution */
  status: "success" | "error" | "cancelled";
  /** Response from the agent (potentially truncated) */
  response: string;
  /** The child agent instance (for advanced use cases - remember to clean up) */
  childAgent?: Agent;
}

type PendingChildQuestion = {
  requestId: string;
  interaction: Extract<ParsedInteractionRequest, { type: "question" }>;
};

function getPendingChildQuestion(state: AgentEventState, requestId: string): PendingChildQuestion | null {
  const currentItem = state.currentlyExecutingInputItem;
  if (!currentItem || currentItem.request.requestId !== requestId) return null;

  const interaction = currentItem.executionState.availableInteractions.find(
    (availableInteraction): availableInteraction is Extract<ParsedInteractionRequest, { type: "question" }> => availableInteraction.type === "question",
  );

  if (!interaction) return null;

  return {
    requestId: currentItem.request.requestId,
    interaction,
  };
}

/**
 * Service for managing sub-agent execution and permissions.
 *
 * This service provides:
 * - Sub-agent permission management with wildcard pattern matching
 * - Sub-agent spawning and lifecycle management
 * - Event forwarding from child agents to parent agents
 * - Automatic cleanup of sub-agents
 */
export default class SubAgentService implements TokenRingService {
  readonly name = "SubAgentService";
  description = "A service for managing sub-agent execution and permissions";

  constructor(readonly app: TokenRingApp) {}

  /**
   * Runs a sub-agent with configurable options for output forwarding.
   *
   * @param agentType - The type of sub-agent to run
   * @param background - Whether to run the sub-agent in the background
   * @param headless - Whether to run the sub-agent in headless mode
   * @param input - Input data for the sub-agent
   * @param options - Configuration options for the sub-agent execution
   * @param parentAgent - The parent agent instance
   * @param autoCleanup - Whether to automatically delete the child agent after execution (default: true)
   * @param checkPermissions - Whether to check the permissions of the parent agent before running the sub-agent (default: true)
   * @returns Promise resolving to the execution result
   */
  async runSubAgent({
    agentType,
    background,
    headless,
    from,
    steps,
    options,
    parentAgent,
    autoCleanup = true,
  }: RunSubAgentOptions): Promise<RunSubAgentResult> {
    const {
      forwardChatOutput,
      forwardReasoning,
      forwardStatusMessages,
      forwardSystemOutput,
      forwardHumanRequests,
      forwardInputCommands,
      forwardArtifacts,
      timeout: timeoutSeconds,
      maxResponseLength,
      minContextLength,
    } = options;

    if (steps.length === 0) {
      throw new Error("An empty steps array was provided for sub-agent execution, which is not allowed.");
    }

    const agentManager = parentAgent.requireServiceByType(AgentManager);

    parentAgent.setCurrentActivity(`Running sub-agent: ${agentType}`);
    const childAgent = agentManager.spawnSubAgent(parentAgent, agentType, { headless });

    let timeoutExceeded = false;

    const listenerAbortController = new AbortController();
    const listenerSignal = listenerAbortController.signal;

    const timer =
      timeoutSeconds > 0
        ? setTimeout(() => {
            timeoutExceeded = true;
            childAgent.abortCurrentOperation(`Sub-agent timed out after ${timeoutSeconds} seconds.`);
            listenerAbortController.abort();
          }, timeoutSeconds * 1000)
        : null;

    let removeParentAbortListener = () => {};
    if (!background) {
      const parentAbortSignal = parentAgent.getAbortSignal();
      const onParentAbort = () => {
        childAgent.abortCurrentOperation(String(parentAbortSignal.reason ?? "Parent agent aborted sub-agent."));
        listenerAbortController.abort(parentAbortSignal.reason);
      };

      parentAbortSignal.addEventListener("abort", onParentAbort, {
        once: true,
      });
      removeParentAbortListener = () => parentAbortSignal.removeEventListener("abort", onParentAbort);
    }

    try {
      await childAgent.waitForState(AgentEventState, state => state.idle);
      const eventCursor = childAgent.getState(AgentEventState).getEventCursorFromCurrentPosition();

      let requestId: string;
      for (const step of steps) {
        const inputMessage = {
          from,
          ...(typeof step === "string" ? { message: step } : step),
        };
        requestId = childAgent.handleInput(inputMessage);
      }

      if (background) {
        return {
          status: "success",
          response: `Agent ${agentType} started in background.`,
          childAgent: childAgent,
        };
      }

      async function forwardChildEventsToParent(): Promise<{
        status: "error" | "cancelled" | "success";
        response: string;
      }> {
        const response = [];
        const mirroredInteractionIds = new Set<string>();

        const removeMirroredInteraction = (interactionId: string) => {
          parentAgent.mutateState(AgentEventState, parentState => {
            const currentItem = parentState.currentlyExecutingInputItem;
            if (!currentItem) return;

            currentItem.executionState.availableInteractions = currentItem.executionState.availableInteractions.filter(
              interaction => interaction.interactionId !== interactionId,
            );
            currentItem.interactionCallbacks.delete(interactionId);
          });
          mirroredInteractionIds.delete(interactionId);
        };

        const clearMirroredInteractions = () => {
          for (const interactionId of mirroredInteractionIds.values()) {
            removeMirroredInteraction(interactionId);
          }
        };

        const mirrorInteractionToParent = (pendingQuestion: PendingChildQuestion) => {
          parentAgent.mutateState(AgentEventState, parentState => {
            const currentItem = parentState.currentlyExecutingInputItem;
            if (!currentItem) {
              throw new Error("Cannot forward a sub-agent interaction when the parent agent has no active input.");
            }

            if (
              !currentItem.executionState.availableInteractions.some(interaction => interaction.interactionId === pendingQuestion.interaction.interactionId)
            ) {
              currentItem.executionState.availableInteractions.push(pendingQuestion.interaction);
            }

            currentItem.interactionCallbacks.set(pendingQuestion.interaction.interactionId, result => {
              const childState = childAgent.getState(AgentEventState);
              const activeInteraction = getPendingChildQuestion(childState, pendingQuestion.requestId);
              if (!activeInteraction || activeInteraction.interaction.interactionId !== pendingQuestion.interaction.interactionId) {
                return;
              }

              childAgent.sendInteractionResponse({
                requestId: pendingQuestion.requestId,
                interactionId: pendingQuestion.interaction.interactionId,
                result,
              });
            });
          });

          mirroredInteractionIds.add(pendingQuestion.interaction.interactionId);
        };

        let lastActivity = agentMessages.noTasks;

        for await (const state of childAgent.subscribeStateAsync(AgentEventState, listenerSignal)) {
          for (const event of state.yieldEventsByCursor(eventCursor)) {
            switch (event.type) {
              case "output.chat":
                if (forwardChatOutput) {
                  parentAgent.chatOutput(event.message);
                }
                response.push(event.message);
                break;

              case "output.reasoning":
                if (forwardReasoning) {
                  parentAgent.reasoningOutput(event.message);
                }
                break;

              case "output.info":
              case "output.warning":
                if (forwardSystemOutput) {
                  parentAgent.mutateState(AgentEventState, eventState => {
                    eventState.events.push(event);
                  });
                }
                break;
              case "output.error":
                parentAgent.mutateState(AgentEventState, eventState => {
                  eventState.events.push(event);
                });
                break;
              case "input.received":
                if (forwardInputCommands) {
                  parentAgent.chatOutput(`
### ${childAgent.config.displayName} (@${agentType})
`);
                }
                break;
              case "agent.response":
                if (event.requestId === requestId) {
                  clearMirroredInteractions();
                  const truncatedResponse = trimMiddle(response.length > 0 ? response.join("") : event.message, minContextLength, maxResponseLength);
                  return {
                    status: event.status,
                    response: truncatedResponse,
                  };
                }
                break;

              case "agent.status":
                if (forwardStatusMessages) {
                  if (lastActivity !== event.currentActivity) {
                    lastActivity = event.currentActivity;
                    parentAgent.chatOutput(`\n- ***${event.currentActivity}***\n`);
                  }
                }
                break;
              case "agent.created":
                //parentAgent.infoMessage(`${agentType} > Agent Created: ${event.message}`);
                break;
              case "agent.stopped":
                //parentAgent.infoMessage(`${agentType} > Agent Stopped: ${event.message}`);
                break;
              case "output.artifact":
                if (forwardArtifacts) {
                  parentAgent.artifactOutput(event);
                }
                break;
              case "cancel":
              case "input.execution":
              case "input.interaction":
              case "toolCall":
                /* ignored */
                break;
              default:
                {
                  // noinspection JSUnusedLocalSymbols
                  const _foo: never = event;
                }
                break;
            }
          }

          const pendingQuestion = getPendingChildQuestion(state, requestId);
          const activeInteractionIds = new Set(pendingQuestion ? [pendingQuestion.interaction.interactionId] : []);

          for (const interactionId of mirroredInteractionIds) {
            if (!activeInteractionIds.has(interactionId)) {
              removeMirroredInteraction(interactionId);
            }
          }

          if (!pendingQuestion) continue;

          if (!forwardHumanRequests) {
            childAgent.abortCurrentOperation("Sub-agent requested user interaction, but interaction forwarding is disabled.");
            continue;
          }

          if (!mirroredInteractionIds.has(pendingQuestion.interaction.interactionId)) {
            mirrorInteractionToParent(pendingQuestion);
          }
        }

        clearMirroredInteractions();
        return {
          status: "cancelled",
          response: "Child agent was aborted",
        };
      }

      const childResult = await forwardChildEventsToParent();

      listenerAbortController.abort();

      if (!childResult) {
        if (timeoutExceeded) {
          return {
            status: "cancelled",
            response: `Agent timed out after ${timeoutSeconds} seconds.`,
            ...(!autoCleanup && { childAgent }),
          };
        }
        return {
          status: "error",
          response: "Child agent did not produce a result",
          ...(!autoCleanup && { childAgent }),
        };
      }
      return {
        ...childResult,
        ...(!autoCleanup && { childAgent }),
      };
    } catch (err: unknown) {
      return {
        status: "error",
        response: formatLogMessages(["Error running sub-agent: ", err as Error]),
        ...(autoCleanup && { childAgent }),
      };
    } finally {
      if (timer) clearTimeout(timer);
      removeParentAbortListener();
      listenerAbortController.abort();
      // Clean up the agent if auto-cleanup is enabled
      if (autoCleanup && !background) {
        agentManager.deleteAgent(childAgent.id, "Parent agent triggered auto-cleanup of sub-agent.");
      }
    }
  }
}
