import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";
import type Agent from "../Agent.ts";
import type { InputMessage, ParsedInteractionRequest } from "../AgentEvents.ts";
import type { ParsedSubAgentConfig } from "../schema.ts";
import AgentManager from "../services/AgentManager.ts";
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

function getPendingChildQuestion(state: AgentEventState): PendingChildQuestion | null {
  const currentItem = state.currentlyExecutingInputItem;
  if (!currentItem) return null;

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
 * Runs a sub-agent with configurable options for output forwarding.
 *
 * @param agentType - The type of sub-agent to run
 * @param background - Whether to run the sub-agent in the background
 * @param headless - Whether to run the sub-agent in headless mode
 * @param input - Input data for the sub-agent
 * @param options - Configuration options for the sub-agent execution
 * @param parentAgent - The parent agent instance
 * @param autoCleanup - Whether to automatically delete the child agent after execution (default: true)
 * @returns Promise resolving to the execution result
 */
export async function runSubAgent({
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
    timeout: timeoutSeconds,
    maxResponseLength,
    minContextLength,
  } = options;

  if (steps.length === 0) {
    throw new Error("An empty steps array was provided for sub-agent execution, which is not allowed.");
  }

  const agentManager = parentAgent.requireService(AgentManager);

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
  const parentAbortMessage = (signal: AbortSignal) => String(signal.reason ?? "Parent agent aborted sub-agent.");

  if (!background) {
    const parentAbortSignal = parentAgent.getAbortSignal();
    const onParentAbort = () => {
      childAgent.abortCurrentOperation(parentAbortMessage(parentAbortSignal));
      listenerAbortController.abort(parentAbortSignal.reason);
    };

    // AbortSignal only fires on future abort events — handle already-aborted parents immediately.
    if (parentAbortSignal.aborted) {
      onParentAbort();
    } else {
      parentAbortSignal.addEventListener("abort", onParentAbort, {
        once: true,
      });
      removeParentAbortListener = () => parentAbortSignal.removeEventListener("abort", onParentAbort);
    }
  }

  try {
    // If parent was already aborted before we started, do not queue work on the child.
    if (!background && parentAgent.getAbortSignal().aborted) {
      return {
        status: "cancelled",
        response: parentAbortMessage(parentAgent.getAbortSignal()),
        ...(!autoCleanup && { childAgent }),
      };
    }

    await childAgent.waitForState(AgentEventState, state => state.idle, parentAgent.getAbortSignal());

    // waitForState resolves immediately when the child is already idle, even if the parent
    // signal is aborted — re-check before queuing steps.
    if (!background && parentAgent.getAbortSignal().aborted) {
      return {
        status: "cancelled",
        response: parentAbortMessage(parentAgent.getAbortSignal()),
        ...(!autoCleanup && { childAgent }),
      };
    }

    const eventCursor = childAgent.getState(AgentEventState).getEventCursorFromCurrentPosition();

    // Queue all steps; completion is keyed off the final step's requestId.
    let finalRequestId = "";
    for (const step of steps) {
      const inputMessage = {
        from,
        ...(typeof step === "string" ? { message: step } : step),
      };
      finalRequestId = childAgent.handleInput(inputMessage);
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
      const response: string[] = [];
      const mirroredInteractionIds = new Set<string>();

      const removeMirroredInteraction = (interactionId: string) => {
        parentAgent.mutateState(AgentEventState, parentState => {
          const currentItem = parentState.currentlyExecutingInputItem;
          if (!currentItem) return;

          const previousLength = currentItem.executionState.availableInteractions.length;
          currentItem.executionState.availableInteractions = currentItem.executionState.availableInteractions.filter(
            interaction => interaction.interactionId !== interactionId,
          );
          currentItem.interactionCallbacks.delete(interactionId);

          // Event-stream clients only see interaction changes via input.execution events.
          if (currentItem.executionState.availableInteractions.length !== previousLength) {
            parentState.pushInputExecution(currentItem);
          }
        });
        mirroredInteractionIds.delete(interactionId);
      };

      const clearMirroredInteractions = () => {
        for (const interactionId of mirroredInteractionIds) {
          removeMirroredInteraction(interactionId);
        }
      };

      const mirrorInteractionToParent = (pendingQuestion: PendingChildQuestion) => {
        parentAgent.mutateState(AgentEventState, parentState => {
          const currentItem = parentState.currentlyExecutingInputItem;
          if (!currentItem) {
            throw new Error("Cannot forward a sub-agent interaction when the parent agent has no active input.");
          }

          const alreadyMirrored = currentItem.executionState.availableInteractions.some(
            interaction => interaction.interactionId === pendingQuestion.interaction.interactionId,
          );
          if (!alreadyMirrored) {
            currentItem.executionState.availableInteractions.push(pendingQuestion.interaction);
            parentState.pushInputExecution(currentItem);
          }

          currentItem.interactionCallbacks.set(pendingQuestion.interaction.interactionId, result => {
            const childState = childAgent.getState(AgentEventState);
            const activeInteraction = getPendingChildQuestion(childState);
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
              // Multi-step runs queue several inputs; only the final step ends the wait.
              if (event.requestId === finalRequestId) {
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
            case "agent.stopped":
            case "cancel":
            case "input.execution":
            case "input.interaction":
            case "toolCall":
              /* ignored */
              break;
            default: {
              const exhaustive: any = event satisfies never;
              throw new Error(`Unhandled event type: ${exhaustive.type}`);
            }
          }
        }

        // Mirror questions for any currently executing step (not only the final one).
        const pendingQuestion = getPendingChildQuestion(state);
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
        response: timeoutExceeded ? `Agent timed out after ${timeoutSeconds} seconds.` : "Child agent was aborted",
      };
    }

    const childResult = await forwardChildEventsToParent();
    return {
      ...childResult,
      ...(!autoCleanup && { childAgent }),
    };
  } catch (err) {
    let parentAborted = false;
    let parentReason = "Parent agent aborted sub-agent.";
    try {
      const parentSignal = parentAgent.getAbortSignal();
      parentAborted = !background && parentSignal.aborted;
      if (parentAborted) parentReason = parentAbortMessage(parentSignal);
    } catch {
      // Parent may no longer have an active input item; treat as a normal error.
    }
    return {
      status: parentAborted ? "cancelled" : "error",
      response: parentAborted ? parentReason : formatLogMessages(["Error running sub-agent: ", err as Error]),
      ...(!autoCleanup && { childAgent }),
    };
  } finally {
    if (timer) clearTimeout(timer);
    removeParentAbortListener();
    listenerAbortController.abort();
    if (autoCleanup && !background) {
      agentManager.deleteAgent(childAgent.id, "Parent agent triggered auto-cleanup of sub-agent.");
    }
  }
}
