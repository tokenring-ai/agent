import ChatService from "./ChatService.js";

/**
 * Executes a chat command and yields output as an async generator
 * @param {string} commandName
 * @param {string} remainder
 * @param {TokenRingRegistry} registry - The package registry
 * @returns {AsyncGenerator<string>}
 */
export async function runCommand(commandName, remainder, registry) {
  const chatService = registry.requireFirstServiceByType(ChatService);

  try {
    commandName = commandName || "help";
    let command = registry.chatCommands.getCommand(commandName);
    if (! command && commandName.endsWith('s')) {
     // If the command name is plural, try it singular as well
     command = registry.chatCommands.getCommand(commandName.slice(0, -1));
    }

    if (command) {
      await command.execute(remainder, registry);
    } else {
      chatService.errorLine((`Unknown command: /${commandName}. Type /help for a list of commands.`));
    }
  } catch (err) {
    chatService.errorLine("Error running command:", err);
  }
}
