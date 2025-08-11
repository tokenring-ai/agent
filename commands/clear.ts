import ChatMessageStorage from "@token-ring/ai-client/ChatMessageStorage";
import ChatService from "../ChatService.ts";

export const description = "/clear - Clear the chat state." as const;

export function execute(_remainder: string | undefined, registry: any): void {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const chatMessageStorage =
		registry.requireFirstServiceByType(ChatMessageStorage);
	chatMessageStorage.setCurrentMessage(null);
	chatService.systemLine("Chat state cleared.");
}

export function help(): string[] {
	return ["/clear - Clear the chat state"];
}
