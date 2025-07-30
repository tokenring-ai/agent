import ChatService from "../ChatService.js";

export const description = "/settings - Show current chat settings.";

export function execute(_remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);

	const model = chatService.getModel() || "(none)";
	const activeServices = registry.services.getServiceNames();
	const activeTools = registry.tools.getEnabledToolNames();
	const mode =
		typeof chatService.getMode === "function"
			? chatService.getMode()
			: "(none)";

	chatService.systemLine("Current settings:");
	chatService.systemLine(`Model: ${model}`);
	chatService.systemLine(
		`Active registry: ${activeServices.length > 0 ? activeServices.join(", ") : "(none)"}`,
	);
	chatService.systemLine(
		`Active tools: ${activeTools.length > 0 ? activeTools.join(", ") : "(none)"}`,
	);
	chatService.systemLine(`Mode: ${mode}`);
}

export function help() {
	return [
		"/settings",
		"  - Show current chat settings, including:",
		"  - Model name",
		"  - Active services",
		"  - Active tools",
		"  - Current mode",
	];
}
