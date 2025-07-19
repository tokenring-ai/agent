import ChatService from "../ChatService.js";
import ChatMessageStorage from "@token-ring/ai-client/ChatMessageStorage";

export const description = "/clear - Clear the chat state.";

export function execute(remainder, registry) {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const chatMessageStorage = registry.requireFirstServiceByType(ChatMessageStorage);
  chatMessageStorage.setCurrentMessage(null);
  chatService.systemLine("Chat state cleared.");
}

export function help() {
  return [
    "/clear - Clear the chat state"
  ]
}
