import ChatMessageStorage from "@token-ring/ai-client/ChatMessageStorage";
import ChatService from "../ChatService.ts";

export const description =
	"/reset - Reset the chat context and clear the chat history." as const;

export function execute(_remainder: string | undefined, registry: any): void {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const chatMessageStorage =
		registry.requireFirstServiceByType(ChatMessageStorage);
	chatMessageStorage.setCurrentMessage(null);
	chatService.emit("reset", undefined);
	chatService.systemLine("Reset chat context and cleared chat.");
}

export function help(): string[] {
	return ["/reset - Reset the chat context and clear the chat history"];
}
