import { Registry } from "@token-ring/registry";
import { z } from "zod";
import AgentRegistry from "../AgentRegistry.ts";
import ChatService from "@token-ring/chat/ChatService";

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
    return { output: agents };
  } catch (err: any) {
    throw new Error(`[${name}] ${err?.message || "Unknown error listing agents"}`);
  }
}

export const description =
  "Lists all available agents. Returns an array of agent names that can be used with the runAgent tool.";

export const parameters = z.object({});
