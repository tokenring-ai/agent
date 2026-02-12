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
  getCommandEntries = this.agentCommands.entries;
  getCommand = this.agentCommands.getItemByName;

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
          agent.errorMessage(`Invalid agent invocation: ${agentMention}`);
        }
      } else {
        agent.errorMessage(`Invalid agent invocation: ${agentMention}`);
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
      await match.item.execute(match.remainder, agent);
    } else {
      const firstWord = commandInput.split(/\s+/)[0];
      agent.errorMessage(`Unknown command: /${firstWord}. Type /help for a list of commands.`);
    }
  }
}
