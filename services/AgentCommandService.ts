import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import {AgentLifecycleService} from "@tokenring-ai/lifecycle";
import {
  AfterAgentInputCancelled,
  AfterAgentInputError,
  AfterAgentInputHandled,
  AfterAgentInputSuccess,
  BeforeAgentInput
} from "@tokenring-ai/lifecycle/util/hooks";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import {v4 as uuid} from "uuid";
import Agent from "../Agent.js";
import {CommandFailedError} from "../AgentError.ts";
import type {InputAttachment, ParsedAgentCancelledResponse, ParsedAgentErrorResponse, ParsedAgentResponse, ParsedAgentSuccessResponse} from "../AgentEvents.ts";
import {AgentEventState, type InputQueueItem} from "../state/agentEventState.ts";
import type {TokenRingAgentCommand} from "../types.js";

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

    let commandInput = message.slice(1); // Remove leading '/'
    const isHelpCommand = commandInput.startsWith("help ");
    if (isHelpCommand) {
      commandInput = commandInput.slice(5);
    }

    let match = this.agentCommands.getLongestPrefixMatch(commandInput);

    if (match) {
      if (isHelpCommand) {
        return match.item.help;
      }

      if (match.item.allowAttachments) {
        const result = await match.item.execute({input: match.remainder, attachments}, agent);
        return result ? result.trim() : "Command completed successfully";
      }

      if (attachments.length > 0) {
        throw new CommandFailedError(`Attachments are not allowed for command: /${match.item.name}`);
      }
      const result = await match.item.execute(match.remainder, agent);
      return result ? result.trim() : "Command completed successfully";
    }
    const firstWord = commandInput.split(/\s+/)[0];
    const matchingCommands = this.agentCommands.getItemEntriesLike(`${firstWord}*`)
    if (matchingCommands.length > 0) {
      throw new CommandFailedError(`
Unknown command: /${firstWord}. 

Possible matching commands: 
${markdownList(matchingCommands.map((cmd) => cmd[1].description).sort())}

Type /help for a list of commands.`
      );
    }
    throw new CommandFailedError(`Unknown command: /${firstWord}. Type /help for a list of commands.`);
  }

  async attach(agent: Agent) {
    agent.runBackgroundTask(async (signal) => this.runAgentLoop(agent, signal));
  }

  async runAgentLoop(agent: Agent, signal: AbortSignal): Promise<void> {
    const handleAbort = () => {
      agent.getState(AgentEventState).inputQueue.forEach(item => item.abortController?.abort());
    };

    signal.addEventListener('abort', handleAbort);

    await agent.waitForState(AgentEventState, state => state.events.some(
      event => event.type === "agent.created"
    ))

    agent.mutateState(AgentEventState, (state) => {
      state.status = "running"
      state.pushAgentStatus();

      if (agent.config.initialCommands.length > 0) {
        for (const initialCommand of agent.config.initialCommands) {
          state.emit({
            type: "input.received",
            requestId: uuid(),
            input: {
              from: "Agent startup commands",
              message: initialCommand
            },
            timestamp: Date.now()
          })
        }
      }
    });

    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      if (state.currentlyExecutingInputItem) continue;
      if (state.inputQueue.length === 0) continue;

      const item = state.inputQueue[0];

      agent.mutateState(AgentEventState, (s) => {
        item.executionState.status = "running";
        state.currentlyExecutingInputItem = item;
        state.pushAgentStatus();
      });

      try {
        await this.processAgentInput(agent, item);
      } finally {
        agent.mutateState(AgentEventState, (eventState) => {
          eventState.currentlyExecutingInputItem = null;
          eventState.inputQueue = eventState.inputQueue.filter(i => i.request.requestId !== item.request.requestId);
          state.pushAgentStatus();
        });
      }
    }
    agent.mutateState(AgentEventState, (state) => {
      state.status = "stopped";
      state.pushAgentStatus();
      signal.removeEventListener('abort', handleAbort);
    })
  }

  private async processAgentInput(agent: Agent, item: InputQueueItem) {
    const agentCommandService = agent.requireServiceByType(AgentCommandService);
    const agentLifecycleService = agent.getServiceByType(AgentLifecycleService);

    const signal = item.abortController.signal;
    const {input, requestId} = item.request;

    let response: ParsedAgentResponse;

    try {
      await agentLifecycleService?.executeHooks(new BeforeAgentInput(item.request), agent);

      const message = await agentCommandService.executeAgentCommand(agent, input.message, input.attachments);

      response = {
        type: 'agent.response',
        timestamp: Date.now(),
        requestId,
        status: 'success',
        message: message.trim(),
      } satisfies ParsedAgentSuccessResponse

      await agentLifecycleService?.executeHooks(new AfterAgentInputSuccess(item.request, response), agent);
    } catch (err) {
      if (signal.aborted) {
        response = {
          type: 'agent.response',
          timestamp: Date.now(),
          requestId,
          status: 'cancelled',
          message: 'Command execution cancelled',
        } satisfies ParsedAgentCancelledResponse;

        await agentLifecycleService?.executeHooks(new AfterAgentInputCancelled(item.request, response), agent);
      } else {
        const message = err instanceof CommandFailedError ? err.message : formatLogMessages([err as Error]);

        response = {
          type: 'agent.response',
          timestamp: Date.now(),
          requestId,
          status: 'error',
          message,
        } satisfies ParsedAgentErrorResponse;

        await agentLifecycleService?.executeHooks(new AfterAgentInputError(item.request, response), agent);
      }
    }

    agent.mutateState(AgentEventState, (s) => {
      s.emit(response);
    })

    // Abort to cleanup any leftover tasks
    item.abortController.abort();

    await agentLifecycleService?.executeHooks(new AfterAgentInputHandled(item.request, response), agent);

  }
}
