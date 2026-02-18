import Agent from "@tokenring-ai/agent/Agent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import deepMerge from "@tokenring-ai/utility/object/deepMerge";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {like} from "@tokenring-ai/utility/string/like";
import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";
import type {ParsedAgentConfig} from "./schema.ts";
import {AgentExecutionState} from "./state/agentExecutionState.ts";
import {SubAgentState} from "./state/subAgentState.ts";

export type RunSubAgentOptions = Partial<ParsedAgentConfig["subAgent"]> & {
  /** The type of agent to create */
  agentType: string;
  /** Whether to run the agent in the background and return immediately (default: false) */
  background?: boolean;
  /** Whether to run the agent in headless mode */
  headless: boolean;
  /** The command to send to the agent */
  command: string;
};

export interface RunSubAgentResult {
  /** Status of the agent execution */
  status: "success" | "error" | "cancelled";
  /** Response from the agent (potentially truncated) */
  response: string;
  /** The child agent instance (for advanced use cases - remember to clean up) */
  childAgent?: Agent;
}

/**
 * Runs a sub-agent with configurable options for output forwarding.
 *
 * @param options - Configuration options for the sub-agent execution
 * @param parentAgent - The parent agent instance
 * @param autoCleanup - Whether to automatically delete the child agent after execution (default: true)
 * @returns Promise resolving to the execution result
 *
 * @example
 * ```typescript
 * // Run with chat output forwarding (default behavior)
 * const result = await runSubAgent({
 *   agentType: "code-assistant",
 *   message: "Write a function to sort an array"
 * }, parentAgent);
 *
 * // Run silently without forwarding output
 * const result = await runSubAgent({
 *   agentType: "code-assistant",
 *   message: "Analyze this code",
 *   context: codeSnippet,
 *   forwardChatOutput: false,
 *   forwardSystemOutput: false
 * }, parentAgent);
 *
 * // Custom timeout and keep agent alive
 * const result = await runSubAgent({
 *   agentType: "researcher",
 *   message: "Research topic",
 *   timeout: 120
 * }, parentAgent, false);
 * // ... use result.childAgent
 * await agentManager.deleteAgent(result.childAgent);
 * ```
 */
export async function runSubAgent(
  options: RunSubAgentOptions,
  parentAgent: Agent,
  autoCleanup: boolean = true
): Promise<RunSubAgentResult> {
  let {
    agentType,
    headless,
    command,
    forwardChatOutput,
    forwardReasoning,
    forwardSystemOutput,
    forwardHumanRequests,
    forwardInputCommands,
    forwardArtifacts,
    timeout: timeoutSeconds,
    maxResponseLength,
    minContextLength,
  } = deepMerge(options, parentAgent.config.subAgent);

  const agentManager = parentAgent.requireServiceByType(AgentManager);
  const parentEventCursor = parentAgent.getState(AgentEventState).getEventCursorFromCurrentPosition();

  const subAgentState = parentAgent.getState(SubAgentState);

  if (!subAgentState.allowedSubAgents.some(allowedAgent => like(allowedAgent, agentType))) {
    throw new Error(`Sub-agent type "${agentType}" is not allowed for this agent.`);
  }

  const childAgent = await agentManager.spawnSubAgent(parentAgent, agentType, { headless });

  let timeoutExceeded = false;

  const abortController = new AbortController();

  const timer = timeoutSeconds > 0 ? setTimeout(() => {
    timeoutExceeded = true;
    abortController.abort();
  }, timeoutSeconds * 1000) : null;

  try {
    await childAgent.waitForState(AgentExecutionState, (state) => state.idle);
    const eventCursor = childAgent.getState(AgentEventState).getEventCursorFromCurrentPosition();

    const requestId = childAgent.handleInput({ message: command });

    if (options.background) {
      childAgent.infoMessage(`${agentType} (background) > `, command.trim());
      return {
        status: "success",
        response: "Agent started in background.",
        childAgent: childAgent,
      };
    }

    async function forwardParentEventsToChild() {
      for await (const state of parentAgent.subscribeStateAsync(AgentEventState, abortController.signal)) {
        for (const parentEvent of state.yieldEventsByCursor(parentEventCursor)) {
          switch (parentEvent.type) {
            case "question.request":
            case "question.response":
              if (forwardHumanRequests) {
                childAgent.mutateState(AgentEventState, (state) => {
                  if (state.events.find((childEvent) => childEvent.type == parentEvent.type && childEvent.requestId === parentEvent.requestId)) {
                    return;
                  }
                })
              }
              break;
            case "abort":
              childAgent.mutateState(AgentEventState, (state) => {
                state.events.push(parentEvent);
              });
              break;
          }
        }
      }
    }


    async function forwardChildEventsToParent(): Promise<{ status: "error" | "cancelled" | "success", response: string}> {
      const response = [];
      for await (const state of childAgent.subscribeStateAsync(AgentEventState, abortController.signal)) {
        for (const event of state.yieldEventsByCursor(eventCursor)) {
          switch (event.type) {
            case "abort":
              abortController.abort();
              break;
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
                parentAgent.mutateState(AgentEventState, (state) => {
                  state.events.push(event);
                })
              }
              break;
            case "output.error":
              parentAgent.mutateState(AgentEventState, (state) => {
                state.events.push(event);
              })
              break;
            case 'input.received':
              if (forwardInputCommands) {
                parentAgent.infoMessage(`${agentType} > ${event.message}`);
              }
              break;

            case "input.handled":
              if (event.status === "success") {
                parentAgent.infoMessage(`Success: ${event.message}`);
              } else {
                parentAgent.errorMessage(`Error: ${event.message}`);
              }

              if (event.requestId === requestId) {
                const truncatedResponse = trimMiddle(
                  response.join(),
                  minContextLength,
                  maxResponseLength
                );
                return {
                  status: event.status,
                  response: truncatedResponse,
                };
              }
              break;

            case "question.request":
            case "question.response":
              if (forwardHumanRequests) {
                parentAgent.mutateState(AgentEventState, (state) => {
                  if (state.events.find((parentEvent) => parentEvent.type == event.type && parentEvent.requestId === event.requestId)) {
                    return;
                  }
                  state.events.push(event);
                })
              }
              break;
            case "agent.created":
              parentAgent.infoMessage(`${agentType} > Agent Created: ${event.message}`);
              break;
            case "agent.stopped":
              parentAgent.infoMessage(`${agentType} > Agent Stopped: ${event.message}`);
              break;
            case "output.artifact":
              if (forwardArtifacts) {
                parentAgent.artifactOutput(event);
              }
              break;
            case "reset":
              parentAgent.infoMessage(`${agentType} > Agent Reset: ${event.what}`);
              break;
            default:
              // noinspection JSUnusedLocalSymbols
              const foo: never = event;
              break;
          }
        }
      }

      return {
        status: "cancelled",
        response: "Child agent was aborted"
      };
    }

    const childResult = await Promise.race([
      forwardParentEventsToChild(),
      forwardChildEventsToParent(),
    ]);

    abortController.abort();

    if (! childResult) {
      if (timeoutExceeded) {
        return {
          status: "cancelled",
          response: `Agent timed out after ${timeoutSeconds} seconds.`,
          childAgent: autoCleanup ? undefined : childAgent,
        }
      }
      return {
        status: "error",
        response: "Child agent did not produce a result",
        childAgent: autoCleanup ? undefined : childAgent,
      }
    }
    return {
      ...childResult,
      childAgent: autoCleanup ? undefined : childAgent,
    };
  } catch (err) {
    return {
      status: "error",
      response: formatLogMessages(["Error running sub-agent: ", err as Error]),
      childAgent: autoCleanup ? undefined : childAgent,
    };
  } finally {
    if (timer) clearTimeout(timer);
    // Clean up the agent if auto-cleanup is enabled
    if (autoCleanup) {
      await agentManager.deleteAgent(childAgent);
    }
  }
}
