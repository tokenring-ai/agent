import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import Agent from "../Agent.js";
import {runSubAgent} from "../runSubAgent.ts";

const name = "agent_run";

/**
 * Creates a new agent, sends it a message, and waits for the response
 */
export async function execute(
  {
    agentType,
    message,
    context,
    forwardChatOutput = true,
    forwardSystemOutput = true,
    timeout,
  }: z.infer<typeof inputSchema>,
  parentAgent: Agent,
): Promise<{
  status: "success" | "error" | "cancelled",
  response: string;
}> {
  if (!agentType) {
    throw new Error("Agent type is required");
  }
  if (!message) {
    throw new Error("Message is required");
  }

  // Use the helper function with the configured options
  return await runSubAgent(
    {
      agentType,
      headless: parentAgent.headless,
      command: `/work ${message}${context ? `\n\nImportant Context:\n${context}` : ''}`,
      forwardChatOutput,
      forwardSystemOutput,
      forwardHumanRequests: true, // Always forward human requests for the tool
      timeout,
      maxResponseLength: 500,
      minContextLength: 300,
    },
    parentAgent,
    true // Auto-cleanup
  );
}

const description =
  "Creates a new agent of the specified type, sends it a message, waits for the response, then cleans up the agent. Useful for getting responses from different agent types.";

const inputSchema = z.object({
  agentType: z
    .string()
    .describe(
      "The type of agent to create (use agent/list to see available types).",
    ),
  message: z.string().describe("The message to send to the agent."),
  context: z
    .string()
    .optional()
    .describe(
      "Important contextual information to pass to the agent, such as file names, task plans, descriptions, instructions, etc. This information is critical to proper agent functionality, and should be detailed and comprehensive. It needs to explain absolutely everything to the agent that will be dispatched. The ONLY information this agent has is the information provided here.",
    ),
  forwardChatOutput: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Whether to forward the sub-agent's chat output to the parent agent. Set to false for silent execution.",
    ),
  forwardSystemOutput: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Whether to forward the sub-agent's system messages to the parent agent.",
    ),
  timeout: z
    .number()
    .optional()
    .describe(
      "Custom timeout in seconds for the sub-agent execution. Overrides the default agent timeout.",
    ),
});

const requiredContextHandlers= ["available-agents"];

export default {
  name, description, inputSchema, execute, requiredContextHandlers
} satisfies TokenRingToolDefinition<typeof inputSchema>;