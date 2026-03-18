import AgentCommandService from "../services/AgentCommandService.js";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../types.ts";

const description = "Runs the agents work handler with the message";
const inputSchema = {
  remainder: {
    name: 'prompt',
    description: "The work request to execute",
    required: true,
  }
} as const satisfies AgentCommandInputSchema;

async function execute({remainder: prompt, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  /* If the agent has a custom workflow defined, use it */
  if (agent.config.workHandler) {
    const result = await agent.config.workHandler(prompt, agent);
    return typeof result === 'string' ? result : "Work completed successfully";
  } else {
    return await agent.requireServiceByType(AgentCommandService).executeAgentCommand(agent, prompt);
  }
}

const help: string = `Invokes the work handler for the agent, with the message corresponding to the work which needs to be completed.

## Usage
/work Write a blog post about AI safety
/work Analyze the latest market trends
/work Create a new user account

## Notes
- If the agent has a custom workHandler configured, it will be used
- Otherwise, the default AgentCommandService will handle the request`;

export default {
  name: "work",
  description,
  inputSchema,
  execute,
  help,
} satisfies TokenRingAgentCommand<typeof inputSchema>
