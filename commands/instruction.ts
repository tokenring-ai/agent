import {Registry} from "@token-ring/registry";
import ChatService from "../ChatService.ts";

export const description =
  "/instructions <instructions ....> - Set or view current instructions" as const;

export function execute(remainder: string | undefined, registry: Registry): void {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const instructions = chatService.getInstructions();

  if (remainder) {
    chatService.setInstructions(remainder.trim());
    chatService.systemLine("Instructions set!");
    return;
  }

  chatService.systemLine(`Current Instructions: ${instructions}`);
}

export function help(): string[] {
  return [
    "/instructions <instructions ....>",
    "  - With no arguments: View current instructions",
    "  - With instructions: Set new instructions",
  ];
}
