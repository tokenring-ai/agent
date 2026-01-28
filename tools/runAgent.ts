import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import Agent from "../Agent.js";
import {runSubAgent} from "../runSubAgent.ts";

const name = "agent_run";
const displayName = "Agent/runAgent";

/**
 * Creates a new agent, sends it a message, and waits for the response
 */
export async function execute(
  {
    agentType,
    message,
    context,
  }: z.output<typeof inputSchema>,
  parentAgent: Agent,
) {
  const result = await runSubAgent(
    {
      agentType,
      headless: parentAgent.headless,
      command: `/work ${message}${context ? `\n\nImportant Context:\n${context}` : ''}`,
    },
    parentAgent,
    true // Auto-cleanup
  );
  
  return { type: 'json' as const, data: result };
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
});

const requiredContextHandlers= ["available-agents"];

export default {
  name, displayName, description, inputSchema, execute, requiredContextHandlers
} satisfies TokenRingToolDefinition<typeof inputSchema>;