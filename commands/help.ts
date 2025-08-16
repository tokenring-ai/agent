import {Registry} from "@token-ring/registry";
import ChatService from "../ChatService.ts";

export const description = "/help - Show this help message" as const;

export async function execute(_remainder: string | undefined, registry: Registry): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);

  chatService.systemLine("Available chat commands:");

  const commands = registry.chatCommands.getCommands();

  for (const cmd of Object.keys(commands).sort()) {
    if (cmd === "help") continue;
    const commandInstance = commands[cmd];
    if (commandInstance.help) {
      const lines = commandInstance.help();
      for (const line of lines) {
        chatService.systemLine(line);
      }
    } else {
      chatService.systemLine(`/${cmd}`);
    }
  }

  chatService.systemLine();
  chatService.systemLine("Type /<command> to run. Use /quit to exit chat.");

  // Multi-line note
  chatService.systemLine(
    "Multi-line entry: Type :paste to enter multi-line mode, type :end on a new line to finish.",
  );
}

export function help(): string[] {
  return ["/help - Show this help message"];
}
