import {Registry} from "@token-ring/registry";
import {z} from "zod";
import AgentRegistry from "../AgentRegistry.ts";
import ChatService from "@token-ring/chat/ChatService";

/**
 * Runs an agent with the given input via the tool interface
 */
export async function execute(
  {agentName, input}: { agentName?: string; input?: string },
  registry: Registry,
): Promise<{
  ok: boolean;
  output?: string;
  metadata?: Record<string, any>;
  error?: string;
}> {
  const chatService: ChatService = registry.requireFirstServiceByType(ChatService);
  const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);

  chatService.infoLine(`[runAgent] Running agent: ${agentName}`);
  
  if (!agentName) {
    return {
      ok: false,
      error: "Agent name is required",
    };
  }
  
  if (!input) {
    return {
      ok: false,
      error: "Input is required",
    }
  }

  try {
    // Use the AgentRegistry's runAgent method
    const result = await agentRegistry.runAgent({agentName, input}, registry);
    
    if (result.error) {
      return {
        ok: false,
        error: result.error
      };
    }
    
    return {
      ok: true,
      output: result.output,
      metadata: result.metadata
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Unknown error running agent",
    };
  }
}

export const description =
  "Run an AI agent with the given input. Agents are specialized AI assistants that can perform specific tasks.";

export const parameters = z.object({
  agentName: z.string().describe("The name of the agent to run."),
  input: z.string().describe("The input to pass to the agent."),
});