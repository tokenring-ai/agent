import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import {CommandFailedError} from "../AgentError.ts";
import type {TokenRingAgentCommand} from "../types.js";

export default class AgentCommandService implements TokenRingService {
  readonly name = "AgentCommandService";
  description = "A service which registers and dispatches agent commands.";

  private agentCommands = new KeyedRegistry<TokenRingAgentCommand>();
  private readonly defaultCommand = "/chat send";

  getCommandNames = this.agentCommands.getAllItemNames;
  getCommandEntries = this.agentCommands.entries;
  getCommand = this.agentCommands.getItemByName;

  addAgentCommands(chatCommands: Record<string, TokenRingAgentCommand>) {
    for (const cmdName in chatCommands) {
      this.agentCommands.register(cmdName, chatCommands[cmdName]);
    }
  }

  async executeAgentCommand(agent: Agent, message: string): Promise<string> {
    const signal = agent.getAbortSignal();
    if (signal.aborted) {
      throw new CommandFailedError("Command execution aborted");
    }

    message = message.trim();
    if (message === '') {
      message = "/help";
    } else if (message.startsWith("@")) {
      const agentMention = message.slice(1);
      const match = agentMention.match(/^@(\S+)\s+(.*)$/i);
      if (match) {
        const [, agentName, prompt] = match;
        if (agentName && prompt) {
          message = `/agent run ${agentName} ${prompt}`;
        } else {
          throw new CommandFailedError(`Invalid agent invocation: ${agentMention}`);
        }
      } else {
        throw new CommandFailedError(`Invalid agent invocation: ${agentMention}`);
      }
    } else if (! message.startsWith("/")) {
     message = `${this.defaultCommand} ${message}`
    }

    const commandInput = message.slice(1); // Remove leading '/'
    let match = this.agentCommands.getLongestPrefixMatch(commandInput);
    if (! match) {
      let replaced = false;
      let singularCommandInput = commandInput.replace(/^([a-z]*)s( |$)/g, (match, command, extra) => {
        replaced = true;
        return `${command}${extra}`;
      });

      if (replaced) {
        match = this.agentCommands.getLongestPrefixMatch(singularCommandInput);
      }
    }

    if (match) {
      const result = await match.item.execute(match.remainder, agent);
      return result ? result.trim() : "Command completed successfully";
    } else {
      const firstWord = commandInput.split(/\s+/)[0];
      throw new CommandFailedError(`Unknown command: /${firstWord}. Type /help for a list of commands.`);
    }
  }
}
