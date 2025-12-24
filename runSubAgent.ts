import Agent from "@tokenring-ai/agent/Agent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";

export interface RunSubAgentOptions {
  /** The type of agent to create */
  agentType: string;
  /** Whether to run the agent in the background and return immediately (default: false) */
  background?: boolean;
  /** Whether to run the agent in headless mode */
  headless: boolean;
  /** The command to send to the agent */
  command: string;
  /** The message to send to the agent */
  //message: string;
  /** Additional context to include with the message */
  //context?: string;
  /** Whether to forward input commands to the parent agent (default: true) */
  forwardInputCommands?: boolean;
  /** Whether to forward chat output to the parent agent (default: true) */
  forwardChatOutput?: boolean;
  /** Whether to forward system messages to the parent agent (default: true) */
  forwardSystemOutput?: boolean;
  /** Whether to forward human requests to the parent agent (default: true) */
  forwardHumanRequests?: boolean;
  /** Whether to forward reasoning output to the parent agent (default: true) */
  forwardReasoning?: boolean;
  /** Custom timeout in seconds (overrides agent config if provided) */
  timeout?: number;
  /** Maximum length for response truncation (default: 500) */
  maxResponseLength?: number;
  /** Minimum context length when truncating (default: 300) */
  minContextLength?: number;
}

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
    forwardChatOutput = true,
    forwardReasoning = true,
    forwardSystemOutput = true,
    forwardHumanRequests = true,
    forwardInputCommands = true,
    timeout,
    maxResponseLength = 500,
    minContextLength = 300,
  } = options;

  const agentManager = parentAgent.requireServiceByType(AgentManager);
  const childAgent = await agentManager.spawnSubAgent(parentAgent, { agentType, headless });

  try {
    let response = "";

    const eventCursor = (
      await childAgent.waitForState(AgentEventState, (state) => state.idle)
    ).getEventCursorFromCurrentPosition();

    if (forwardChatOutput || forwardSystemOutput) {
      childAgent.infoLine("Sending message to agent:", command);
    }

    const requestId = childAgent.handleInput({ message: command });

    if (options.background) {
      return {
        status: "success",
        response: "Agent started in background.",
        childAgent: childAgent,
      };
    }

    return await new Promise((resolve, reject) => {
      const unsubscribe = childAgent.subscribeState(AgentEventState, (state) => {
        for (const event of state.yieldEventsByCursor(eventCursor)) {
          switch (event.type) {
            case "output.chat":
              if (forwardChatOutput) {
                parentAgent.chatOutput(event.message);
              }
              response += event.message;
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
                parentAgent.chatOutput(`Running command: ${event.message}`);
              }
              break;

            case "input.handled":
              if (event.status === "success") {
                parentAgent.infoLine(`Success: ${event.message}`);
              } else {
                parentAgent.errorLine(`Error: ${event.message}`);
              }

              if (event.requestId === requestId) {
                unsubscribe();
                const truncatedResponse = trimMiddle(
                  event.message,
                  minContextLength,
                  maxResponseLength
                );
                resolve({
                  status: event.status,
                  response: truncatedResponse,
                  childAgent: autoCleanup ? undefined : childAgent,
                });
              }
              break;

            case "human.request":
              if (forwardHumanRequests) {
                const humanRequestId = event.id;
                parentAgent
                  .askHuman(event.request)
                  .then((humanResponse) =>
                    childAgent?.sendHumanResponse(humanRequestId, humanResponse)
                  )
                  .catch((err) => reject(err));
              } else {
                // If not forwarding, reject the human request
                const humanRequestId = event.id;
                childAgent?.sendHumanResponse(
                  humanRequestId,
                  "Human input is not available in this context."
                );
              }
              break;
          }
        }
      });

      // Use custom timeout if provided, otherwise use agent config
      const timeoutSeconds = timeout ?? parentAgent.config.maxRunTime;
      if (timeoutSeconds > 0) {
        setTimeout(() => {
          unsubscribe();
          resolve({
            status: "cancelled",
            response: `Agent timed out after ${timeoutSeconds} seconds.`,
            childAgent: autoCleanup ? undefined : childAgent,
          });
        }, timeoutSeconds * 1000);
      }
    });
  } catch (err) {
    return {
      status: "error",
      response: formatLogMessages(["Error running sub-agent: ", err as Error]),
      childAgent: autoCleanup ? undefined : childAgent,
    };
  } finally {
    // Clean up the agent if auto-cleanup is enabled
    if (autoCleanup) {
      await agentManager.deleteAgent(childAgent);
    }
  }
}
