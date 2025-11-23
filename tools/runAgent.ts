import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";
import {z} from "zod";
import Agent from "../Agent.js";
import AgentConfigService from "../services/AgentConfigService.js";

export const name = "agent/run";

/**
 * Creates a new agent, sends it a message, and waits for the response
 */
export async function execute(
  {
    agentType,
    message,
    context,
  }: { agentType?: string; message?: string; context?: string },
  agent: Agent,
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

  const agentConfigService = agent.requireServiceByType(AgentConfigService);
  // Create a new agent of the specified type
  const newAgent = await agentConfigService.spawnSubAgent(agent, agentType);

  try {
    let response = "";

    agent.setBusy("Waiting for agent response...");

    let inputSent = false;

    // Promise to collect the response
    for await (const event of newAgent.events(agent.getAbortSignal())) {
      switch (event.type) {
        case "output.chat":
          response += event.data.content;
          agent.chatOutput(event.data.content);
          break;
        case "output.system":
          agent.systemMessage(event.data.message, event.data.level);
          // Include system messages in the response for debugging
          if (event.data.level === "error") {
            response += `[System Error: ${event.data.message}]\n`;
          }
          break;
        case "state.idle":
          if (!inputSent) {
            inputSent = true;

            if (context) {
              message = `${message}\n\nImportant Context:\n${context}`;
            }
            agent.infoLine("Sending message to agent:", message);
            newAgent.handleInput({message: `/work ${message}`});
          } else if (response) {
            return {
              ok: true,
              response: trimMiddle(response, 300, 500),
            };
          } else {
            return {
              ok: false,
              response: "[Something went wrong, No response generated]",
            };
          }
          break;
        case "state.aborted":
          return {
            ok: false,
            response: response.trim() || "[Agent was terminated]",
          };
        case "human.request":
          // Forward human requests to the parent agent
          const humanResponse = await agent.askHuman(event.data.request);
          newAgent.sendHumanResponse(event.data.sequence, humanResponse);
          break;
      }
    }

    return {
      ok: false,
      response: "[Agent ended prematurely]",
    };
  } finally {
    // Clean up the agent
    await agent.team.deleteAgent(newAgent);
  }
}

export const description =
  "Creates a new agent of the specified type, sends it a message, waits for the response, then cleans up the agent. Useful for getting responses from different agent types.";

export const inputSchema = z.object({
  agentType: z
    .string()
    .describe(
      "The type of agent to create (use agent/list to see available types).",
    ),
  message: z.string().describe("The message to send to the agent."),
  context: z
    .string()
    .describe(
      "Important contextual information to pass to the agent, such as file names, task plans, descriptions, instructions, etc. This information is critical to proper agent functionality, and should be detailed and comprehensive. It needs to explain absolutely everything to the agent that will be dispatched. The ONLY information this agent has is the information provided here.",
    ),
});
