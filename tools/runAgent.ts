import {z} from "zod";
import Agent from "../Agent.js";

export const name = "agent/run";

/**
 * Creates a new agent, sends it a message, and waits for the response
 */
export async function execute(
  {agentType, message}: { agentType?: string; message?: string },
  agent: Agent
): Promise<{
  ok: boolean;
  response?: string;
  error?: string;
}> {
  if (!agentType) {
    throw new Error("Agent type is required");
  }
  if (!message) {
    throw new Error("Message is required");
  }

  try {
    // Create a new agent of the specified type
    const newAgent = await agent.team.createAgent(agentType);

    agent.systemMessage(`Created new agent: ${newAgent.options.name} (${newAgent.id.slice(0, 8)})`);

    let response = "";
    let hasResponse = false;

    // Create an abort controller for the event stream
    const abortController = new AbortController();

    // Promise to collect the response
    const responsePromise = new Promise<void>((resolve) => {
      const processEvents = async () => {
        try {
          for await (const event of newAgent.events(abortController.signal)) {
            switch (event.type) {
              case 'output.chat':
                response += event.data.content;
                hasResponse = true;
                break;
              case 'output.system':
                // Include system messages in the response for debugging
                if (event.data.level === 'error') {
                  response += `[System Error: ${event.data.message}]\n`;
                }
                break;
              case 'state.idle':
                if (hasResponse) {
                  // Agent has finished processing and we have a response
                  resolve();
                  return;
                }
                break;
              case 'state.aborted':
                resolve();
                return;
            }
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error("Error processing agent events:", error);
          }
          resolve();
        }
      };

      processEvents();
    });

    // Send the message to the new agent
    await newAgent.handleInput({message});

    // Wait for the response with a timeout
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        abortController.abort("Response timeout");
        resolve();
      }, 30000); // 30 second timeout
    });

    await Promise.race([responsePromise, timeoutPromise]);

    // Clean up the agent
    await agent.team.deleteAgent(newAgent);

    if (abortController.signal.aborted && abortController.signal.reason === "Response timeout") {
      return {
        ok: false,
        error: "Agent response timed out after 30 seconds"
      };
    }

    return {
      ok: true,
      response: response.trim() || "[No response generated]"
    };

  } catch (error) {
    return {
      ok: false,
      error: `Failed to run agent: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export const description =
  "Creates a new agent of the specified type, sends it a message, waits for the response, then cleans up the agent. Useful for getting responses from different agent types.";

export const inputSchema = z.object({
  agentType: z.string().describe("The type of agent to create (use agent/list to see available types)."),
  message: z.string().describe("The message to send to the agent."),
});