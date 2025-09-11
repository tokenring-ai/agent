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

    // Create a new agent of the specified type
  const newAgent = await agent.team.createAgent(agentType);

  try {
    agent.systemMessage(`Created new agent: ${newAgent.options.name} (${newAgent.id.slice(0, 8)})`);

    let response = "";

    agent.setBusy("Waiting for agent response...");

    newAgent.handleInput({message});

    // Promise to collect the response
    for await (const event of newAgent.events(agent.getAbortSignal())) {
      switch (event.type) {
        case 'output.chat':
          response += event.data.content;
          agent.chatOutput(event.data.content)
          break;
        case 'output.system':
          agent.systemMessage(event.data.message, event.data.level);
          // Include system messages in the response for debugging
          if (event.data.level === 'error') {
            response += `[System Error: ${event.data.message}]\n`;
          }
          break;
        case 'state.idle':
          if (response) {
            return {
              ok: true,
              response: response.trim() || "[No response generated]"
            };
          } else {
            return {
              ok: false,
              response: response.trim() || "[Something went wrong, No response generated]"
            };
          }
        case 'state.aborted':
          return {
            ok: false,
            response: response.trim() || "[Agent was terminated]"
          };
      }
    }

    return {
      ok: false,
      response: "[Agent ended prematurely]"
    }
  } finally {
    // Clean up the agent
    await agent.team.deleteAgent(newAgent);
  }
}

export const description =
  "Creates a new agent of the specified type, sends it a message, waits for the response, then cleans up the agent. Useful for getting responses from different agent types.";

export const inputSchema = z.object({
  agentType: z.string().describe("The type of agent to create (use agent/list to see available types)."),
  message: z.string().describe("The message to send to the agent."),
});