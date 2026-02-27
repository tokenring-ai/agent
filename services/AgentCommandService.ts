import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {v4 as uuid} from "uuid";
import Agent from "../Agent.js";
import {CommandFailedError} from "../AgentError.ts";
import type {InputAttachment, InputReceived} from "../AgentEvents.ts";
import {AgentEventState} from "../state/agentEventState.ts";
import type {TokenRingAgentCommand} from "../types.js";
import AgentLifecycleService from "./AgentLifecycleService.ts";

export default class AgentCommandService implements TokenRingService {
  readonly name = "AgentCommandService";
  description = "A service which registers and dispatches agent commands.";

  private agentCommands = new KeyedRegistry<TokenRingAgentCommand>();
  private readonly defaultCommand = "/chat send";

  getCommandNames = this.agentCommands.getAllItemNames;
  getCommandEntries = this.agentCommands.entries;
  getCommand = this.agentCommands.getItemByName;

  constructor(private readonly app: TokenRingApp) {
  }

  addAgentCommands(...commands: (TokenRingAgentCommand | TokenRingAgentCommand[])[]) {
    for (const command of commands.flat()) {
      this.agentCommands.register(command.name, command);
      for (const alias of command.aliases ?? []) {
        this.agentCommands.register(alias, command);
      }
    }
  }

  async executeAgentCommand(agent: Agent, message: string, attachments: InputAttachment[] = []): Promise<string> {
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
    } else if (!message.startsWith("/")) {
      message = `${this.defaultCommand} ${message}`
    }

    const commandInput = message.slice(1); // Remove leading '/'
    let match = this.agentCommands.getLongestPrefixMatch(commandInput);

    if (match) {
      if (match.item.allowAttachments) {
        const result = await match.item.execute({ input: match.remainder, attachments }, agent);
        return result ? result.trim() : "Command completed successfully";
      } else {
        if (attachments.length > 0) {
          throw new CommandFailedError(`Attachments are not allowed for command: /${match.item.name}`);
        }
        const result = await match.item.execute(match.remainder, agent);
        return result ? result.trim() : "Command completed successfully";
      }
    } else {
      const firstWord = commandInput.split(/\s+/)[0];
      throw new CommandFailedError(`Unknown command: /${firstWord}. Type /help for a list of commands.`);
    }
  }

  async attach(agent: Agent) {
    agent.runBackgroundTask(async (signal) => this.runAgentLoop(agent, signal));
  }

  async runAgentLoop(agent: Agent, signal: AbortSignal): Promise<void> {
    signal.addEventListener('abort', () => agent.agentShutdownSignal);

    await agent.waitForState(AgentEventState, state => state.events.some(
      event => event.type === "agent.created"
    ))

    agent.mutateState(AgentEventState, (state) => {
      state.updateExecutionState({
        running: true,
      });
      if (agent.config.initialCommands.length > 0) {
        for (const message of agent.config.initialCommands) {
          state.events.push({type: "input.received", message: message.trim(), requestId: uuid(), timestamp: Date.now()});
        }
      }
    });

    for await (const state of agent.subscribeStateAsync(AgentEventState, agent.agentShutdownSignal)) {
      if (state.latestExecutionState!.inputQueue.length === 0) continue;

      const item = state.latestExecutionState!.inputQueue[0];

      const itemAbortController = new AbortController();
      const handleAgentAbort = () => itemAbortController.abort();
      agent.agentShutdownSignal.addEventListener('abort', handleAgentAbort);

      agent.mutateState(AgentEventState, (s) => {
        s.updateExecutionState({currentlyExecuting: item.requestId});
        s.currentExecutionAbortController = itemAbortController;
      });

      try {
        await this.processAgentInput(agent, item, itemAbortController.signal);
      } finally {
        agent.agentShutdownSignal.removeEventListener('abort', handleAgentAbort);
        agent.mutateState(AgentEventState, (eventState) => {
          eventState.currentExecutionAbortController = null;
          eventState.updateExecutionState({
            currentlyExecuting: null,
            inputQueue: [...eventState.latestExecutionState!.inputQueue.filter(i => i.requestId !== item.requestId)],
          })
        });
      }
    }
  }

  private async processAgentInput(agent: Agent, item: InputReceived, signal: AbortSignal) {
    const agentCommandService = agent.requireServiceByType(AgentCommandService);
    const agentLifecycleService = agent.getServiceByType(AgentLifecycleService);

    try {
      const message = await agentCommandService.executeAgentCommand(agent, item.message, item.attachments);
      await agentLifecycleService?.executeHooks(agent, "afterAgentInputComplete", item.message);

      agent.mutateState(AgentEventState, (s) => {
        s.emit({
          type: "input.handled",
          requestId: item.requestId,
          status: "success",
          message,
          timestamp: Date.now(),
        });
      });
    } catch (err) {
      const status = signal.aborted ? "cancelled" : "error";

      const message = err instanceof CommandFailedError ? err.message : formatLogMessages([err as Error]);
      agent.mutateState(AgentEventState, (s) => {
        s.emit({
          type: "input.handled",
          requestId: item.requestId,
          status,
          message,
          timestamp: Date.now(),
        });
      });
    }
  }
}
