import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import {z} from "zod";
import AgentRegistry from "../AgentRegistry.ts";

/**
 * Runs an agent with the given input via the tool interface
 */
export const name = "agent/runAgent";

export async function execute(
  {agentName, input}: { agentName?: string; input?: string },
  registry: Registry,
): Promise<
  { ok: true; output?: string; metadata?: Record<string, any> }
> {
  const chatService: ChatService = registry.requireFirstServiceByType(ChatService);
  const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);

  chatService.infoLine(`[${name}] Running agent: ${agentName}`);

  if (!agentName) {
    throw new Error(`[${name}] Agent name is required`);
  }

  if (!input) {
    throw new Error(`[${name}] Input is required`);
  }

  try {
    // Use the AgentRegistry's runAgent method
    const result = await agentRegistry.runAgent({agentName, input}, registry);

    return {ok: true, output: result.output, metadata: result.metadata};
  } catch (err: unknown) {
    const message = err instanceof Error && err.message ? err.message : "Unknown error running agents";
    throw new Error(`[${name}] ${message}`);
  }
}

export const description =
  "Run an AI agent with the given input. Agents are specialized AI assistants that can perform specific tasks.";

export const inputSchema = z.object({
  agentName: z.string().describe("The name of the agent to run."),
  input: z.string().describe("The input to pass to the agent."),
});
