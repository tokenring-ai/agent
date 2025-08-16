import ChatMessageStorage from "@token-ring/ai-client/ChatMessageStorage";
import MemoryService from "@token-ring/memory/MemoryService";
import {Registry} from "@token-ring/registry";
import ChatService from "../ChatService.ts";

export const description = "/clear [chat|memory|all]... - Clear chat state and/or memory." as const;

export function execute(remainder: string | undefined, registry: Registry): void {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const chatMessageStorage = registry.requireFirstServiceByType(ChatMessageStorage);
  const memoryService = registry.requireFirstServiceByType(MemoryService);

  // Parse arguments
  const args = remainder?.trim().split(/\s+/) || [];

  // Default behavior: clear chat if no args provided
  if (args.length === 0 || args[0] === "") {
    clearChat(chatMessageStorage, chatService);
    return;
  }

  // Process each argument
  const clearedItems = new Set<string>();

  for (const arg of args) {
    switch (arg.toLowerCase()) {
      case "chat":
        if (!clearedItems.has("chat")) {
          clearChat(chatMessageStorage, chatService);
          clearedItems.add("chat");
        }
        break;

      case "memory":
        if (!clearedItems.has("memory")) {
          clearMemory(memoryService, chatService);
          clearedItems.add("memory");
        }
        break;

      case "all":
        if (!clearedItems.has("chat")) {
          clearChat(chatMessageStorage, chatService);
          clearedItems.add("chat");
        }
        if (!clearedItems.has("memory")) {
          clearMemory(memoryService, chatService);
          clearedItems.add("memory");
        }
        break;

      default:
        chatService.errorLine(`Unknown argument: ${arg}`);
        chatService.errorLine("Valid arguments are: chat, memory, all");
        return;
    }
  }
}

function clearChat(chatMessageStorage: ChatMessageStorage, chatService: ChatService): void {
  chatMessageStorage.setCurrentMessage(null);
  chatService.emit("reset", undefined);
  chatService.systemLine("Chat state cleared.");
}

function clearMemory(memoryService: MemoryService, chatService: ChatService): void {
  memoryService.clearMemory();
  chatService.systemLine("Memory cleared.");
}

export function help(): string[] {
  return [
    "/clear [chat|memory|all]...",
    "  - No arguments: clears chat state",
    "  - chat: clears chat state",
    "  - memory: clears memory items",
    "  - all: clears both chat state and memory",
    "  - Multiple arguments can be specified (e.g., /clear chat memory)"
  ];
}
