import ChatService from "../ChatService.ts";
import {Registry} from "@token-ring/registry";

export const description = "/settings - Show current chat settings." as const;

export function execute(_remainder: string | undefined, registry: Registry): void {
	const chatService = registry.requireFirstServiceByType(ChatService);

	const model = chatService.getModel() || "(none)";
	const activeServices: string[] = registry.services.getServiceNames();
	const activeTools: string[] = registry.tools.getEnabledToolNames();
	const persona = chatService.getPersona();

	chatService.systemLine("Current settings:");
	chatService.systemLine(`Model: ${model}`);
	chatService.systemLine(
		`Active registry: ${activeServices.length > 0 ? activeServices.join(", ") : "(none)"}`,
	);
	chatService.systemLine(
		`Active tools: ${activeTools.length > 0 ? activeTools.join(", ") : "(none)"}`,
	);
	chatService.systemLine(`Persona: ${persona}`);
}

export function help(): string[] {
	return [
		"/settings",
		"  - Show current chat settings, including:",
		"  - Model name",
		"  - Active services",
		"  - Active tools",
		"  - Current mode",
	];
}
