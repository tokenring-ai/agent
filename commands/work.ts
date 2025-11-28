import {Agent} from "@tokenring-ai/agent";
import AgentCommandService from "../services/AgentCommandService.js";
import {TokenRingAgentCommand} from "../types.ts";

const description =
  "/work - Runs the agents work handler with the message";

async function execute(remainder: string, agent: Agent): Promise<void> {
  if (!remainder?.trim()) {
    agent.infoLine(
      "Please provide a message indicating the work to be completed",
    );
    return;
  }

  /* If the agent has a custom workflow defined, use it */
  if (agent.config.workHandler) {
    await agent.config.workHandler(remainder, agent);
  } else {
    await agent.requireServiceByType(AgentCommandService).executeAgentCommand(agent, remainder);
  }
}

const help: string = `# /work

## Description
Invokes the work handler for the agent, with the message corresponding to the work which needs to be completed.

## Usage
/work Write a blog post about AI safety
/work Analyze the latest market trends
/work Create a new user account

## Notes
- If the agent has a custom workHandler configured, it will be used
- Otherwise, the default AgentCommandService will handle the request`;

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand