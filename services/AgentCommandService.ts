import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import type {TokenRingAgentCommand} from "../types.js";

export default class AgentCommandService implements TokenRingService {
  readonly name = "AgentCommandService";
  description = "A service which registers and dispatches agent commands.";

  private agentCommands = new KeyedRegistry<TokenRingAgentCommand>();
  private readonly defaultCommand = "/chat send";

  getCommandNames = this.agentCommands.getAllItemNames;
  getCommands = this.agentCommands.getAllItems;
  getCommand = this.agentCommands.requireItemByName;

  addAgentCommands(chatCommands: Record<string, TokenRingAgentCommand>) {
    for (const cmdName in chatCommands) {
      this.agentCommands.register(cmdName, chatCommands[cmdName]);
    }
  }

  async executeAgentCommand(agent: Agent, message: string): Promise<void> {
    const signal = agent.getAbortSignal();
    if (signal.aborted) {
      agent.warningMessage(`Command execution aborted when running command: ${message}`);
      return;
    }

    message = message.trim();
    if (message && ! message.startsWith("/")) {
     message = `${this.defaultCommand} ${message}`
    }

    let commandName = "help"
    let remainder = message
      .replace(/^\s*\/(\S*)/, (_unused, matchedCommandName) => {
        commandName = matchedCommandName;
        return "";
      })
      .trim();

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
      agent.errorMessage(`Unknown command: /${commandName}. Type /help for a list of commands.`);
    }
  }
}
