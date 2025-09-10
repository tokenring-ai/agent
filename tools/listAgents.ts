import {z} from "zod";
import Agent from "../Agent.js";

export const name = "agent/list";

/**
 * Lists all available agent types that are registered with the agent team
 */
export async function execute({},
                              agent: Agent
): Promise<{
  ok: boolean;
  agentTypes: string[];
  error?: string;
}> {
  // Get the list of available agent types from the agent team
  const agentTypes = agent.team.getAgentTypes();

  return {
    ok: true,
    agentTypes,
  };
}

export const description =
  "Lists all available agent types that are registered with the agent team. Returns an array of agent type names that can be used to create new agents.";

export const inputSchema = z.object({});