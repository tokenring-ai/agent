import KeyedRegistry from "@tokenring-ai/utility/KeyedRegistry";
import Agent from "../Agent.js";
import type {TokenRingAgentCommand, TokenRingService} from "../types.js";

export default class AgentCommandService implements TokenRingService {
  name = "AgentCommandService";
  description = "A service which registers and dispatches agent commands.";

  private agentCommands = new KeyedRegistry<TokenRingAgentCommand>();

  getCommandNames = this.agentCommands.getAllItemNames;
  getCommands = this.agentCommands.getAllItems;

  addAgentCommands(chatCommands: Record<string, TokenRingAgentCommand>) {
    for (const cmdName in chatCommands) {
      this.agentCommands.register(cmdName, chatCommands[cmdName]);
    }
  }

  async executeAgentCommand(agent: Agent, message: string): Promise<void> {
    let commandName = "chat";
    let remainder = message
      .replace(/^\s*\/(\S*)/, (_unused, matchedCommandName) => {
        commandName = matchedCommandName;
        return "";
      })
      .trim();

    commandName = commandName || "help";
    // Get command from agent's chat commands
    const commands = this.agentCommands.getAllItems();
    let command = commands[commandName];

    if (!command && commandName.endsWith("s")) {
      // If the command name is plural, try it singular as well
      command = commands[commandName.slice(0, -1)];
    }

    if (command) {
      await command.execute(remainder, agent);
    } else {
      agent.errorLine(`Unknown command: /${commandName}. Type /help for a list of commands.`);
    }
  }
}
