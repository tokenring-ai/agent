import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import {z} from "zod";
import AgentRegistry from "../AgentRegistry.ts";

/**
 * Chat command for interacting with agents
 */
export async function execute(
  {command, args}: { command: string; args: string[] },
  registry: Registry,
): Promise<void> {
  const chatService: ChatService = registry.requireFirstServiceByType(ChatService);
  const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);

  if (!command) {
    displayHelp(chatService);
    return;
  }

  switch (command.toLowerCase()) {
    case "list":
      const agents = agentRegistry.list();
      if (agents.length === 0) {
        chatService.systemLine("No agents registered.");
      } else {
        chatService.systemLine("Available agents:");
        for (const agentName of agents) {
          chatService.systemLine(`- ${agentName}`);
        }
      }
      break;

    case "run":
      const [agentName, ...inputParts] = args;
      const input = inputParts.join(" ");

      if (!agentName) {
        chatService.systemLine("Error: Agent name is required.");
        chatService.systemLine("Usage: /agent run <agentName> <input>");
        return;
      }

      if (!input) {
        chatService.systemLine("Error: Input is required.");
        chatService.systemLine("Usage: /agent run <agentName> <input>");
        return;
      }

      chatService.systemLine(`Running agent: ${agentName}`);
      chatService.emit("waiting", null);

      try {
        const result = await agentRegistry.runAgent({agentName, input}, registry);
        if (result.error) {
          chatService.errorLine(result.error);
        } else {
          chatService.infoLine(result.output);
        }
      } catch (error: any) {
        chatService.errorLine(`Error running agent: ${error?.message || error}`);
      } finally {
        chatService.emit("doneWaiting", null);
      }
      break;

    default:
      chatService.systemLine(`Unknown command: ${command}`);
      displayHelp(chatService);
      break;
  }
}

/**
 * Display help information about agent commands
 */
function displayHelp(chatService: ChatService): void {
  chatService.systemLine("Agent Commands:");
  chatService.systemLine("  /agent list - List all available agents");
  chatService.systemLine("  /agent run <agentName> <input> - Run an agent with the specified input");
}

export const schema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
});

export const description = "Interact with AI agents";