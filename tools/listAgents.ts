import { Registry } from "@token-ring/registry";
import { z } from "zod";
import AgentRegistry from "../AgentRegistry.ts";

/**
 * Lists all available agents via the tool interface
 */
export async function execute(
  {},
  registry: Registry,
): Promise<{ output: string[] } | { error: string }> {
  try {
    const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);

    // Get the list of agents
    const agents = agentRegistry.list();

    // Return output without tool name prefix
    return { output: agents };
  } catch (err: any) {
    return { error: err?.message || "Unknown error listing agents" };
  }
}

export const description =
  "Lists all available agents. Returns an array of agent names that can be used with the runAgent tool.";

export const parameters = z.object({});
