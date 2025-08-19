import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import {z} from "zod";
import AgentRegistry from "../AgentRegistry.ts";

/**
 * Lists all available agents via the tool interface
 */
export const name = "agent/listAgents";

export async function execute(
  {},
  registry: Registry,
): Promise<{ output: string[] }> {
  const chatService: ChatService = registry.requireFirstServiceByType(ChatService);
  const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);

  chatService.infoLine(`[${name}] Listing agents`);

  try {
    // Get the list of agents
    const agents = agentRegistry.list();
    return {output: agents};
  } catch (err: unknown) {
    const message = err instanceof Error && err.message ? err.message : "Unknown error listing agents";
    throw new Error(`[${name}] ${message}`);
  }
}

export const description =
  "Lists all available agents. Returns an array of agent names that can be used with the runAgent tool.";

export const inputSchema = z.object({});
