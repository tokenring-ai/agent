import type {Registry} from "@token-ring/registry";
import ChatService from "./ChatService.ts";

/**
 * Executes a chat command
 */
export async function runCommand(
  commandName: string,
  remainder: string,
  registry: Registry,
): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);

  try {
    commandName = commandName || "help";
    let command = registry.chatCommands.getCommand(commandName);
    if (!command && commandName.endsWith("s")) {
      // If the command name is plural, try it singular as well
      command = registry.chatCommands.getCommand(commandName.slice(0, -1));
    }

    if (command) {
      await command.execute(remainder, registry);
    } else {
      chatService.errorLine(
        `Unknown command: /${commandName}. Type /help for a list of commands.`,
      );
    }
  } catch (err) {
    if (! chatService.getAbortSignal()?.aborted) {
      // Only output an error if the command wasn't aborted'
      chatService.errorLine("Error running command:", err);
    }
  }
}
