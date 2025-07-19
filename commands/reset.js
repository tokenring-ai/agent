import ChatService from "../ChatService.js";
import ChatMessageStorage from "@token-ring/ai-client/ChatMessageStorage";

export const description =
	"/reset - Reset the chat context and clear the chat history.";

export function execute(remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const chatMessageStorage =
		registry.requireFirstServiceByType(ChatMessageStorage);
	chatMessageStorage.setCurrentMessage(null);
	chatService.emit("reset");
	chatService.systemLine("Reset chat context and cleared chat.");
}

export function help() {
	return ["/reset - Reset the chat context and clear the chat history"];
}
