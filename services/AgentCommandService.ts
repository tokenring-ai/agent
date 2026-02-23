import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {v4 as uuid} from "uuid";
import Agent from "../Agent.js";
import {CommandFailedError} from "../AgentError.ts";
import {getDefaultQuestionValue} from "../question.ts";
import {AgentEventState} from "../state/agentEventState.ts";
import {AgentExecutionState} from "../state/agentExecutionState.ts";
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

  constructor(private readonly app: TokenRingApp) {}

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

  async attach(agent: Agent) {
    this.app.trackPromise(this, async (abortSignal) => {
      await this.runAgentLoop(agent, abortSignal);
    });
  }

  async runAgentLoop(agent: Agent, signal: AbortSignal): Promise<void> {
    signal.addEventListener('abort', () => agent.agentShutdownSignal);

    if (agent.config.initialCommands.length > 0) {
      agent.mutateState(AgentEventState, (state) => {
        for (const message of agent.config.initialCommands) {
          state.events.push({type: "input.received", message: message.trim(), requestId: uuid(), timestamp: Date.now()});
        }
      })
    }

    const eventCursor = { position: 0 };

    for await (const state of agent.subscribeStateAsync(AgentEventState, agent.agentShutdownSignal)) {
      for (const event of state.yieldEventsByCursor(eventCursor)) {
        if (event.type === "input.received") {
          agent.mutateState(AgentExecutionState, (s) => {
            s.inputQueue.push(event);
          });
        } else if (event.type === "abort") {
          this.handleAbort(agent, event.message);
        } else if (event.type === 'question.request' ) {
          agent.mutateState(AgentExecutionState, (s) => {
            s.waitingOn.push(event);
            if (event.autoSubmitAfter > 0) {
              const requestId = event.requestId;
              const autoSubmitAfterMs = event.autoSubmitAfter * 1000;
              setTimeout(() => {
                agent.mutateState(AgentEventState, (s) => {
                  for (const e of s.events) {
                    if ((e.type === 'question.response') && e.requestId === requestId) return;
                  }

                  s.events.push({ type: 'question.response', requestId, result: getDefaultQuestionValue(event.question), timestamp: Date.now() });
                });
              }, autoSubmitAfterMs);
            }
          });
        } else if (event.type === "question.response") {
          agent.mutateState(AgentExecutionState, (s) => {
            s.waitingOn = s.waitingOn.filter(item => item.requestId !== event.requestId);
          })
        }
      }

      this.startNextExecution(agent);
    }
  }

  private handleAbort(agent: Agent, reason?: string): void {
    agent.mutateState(AgentExecutionState, (state) => {
      const requestId = state.currentlyExecuting?.requestId;

      state.inputQueue.splice(0, state.inputQueue.length);

      agent.mutateState(AgentEventState, (eventState) => {
        for (const item of state.inputQueue.filter(r => r.requestId !== requestId)) {
          if (item.requestId === requestId) continue;
          eventState.emit({
            type: "input.handled",
            requestId: item.requestId,
            status: "cancelled",
            message: "Aborted",
            timestamp: Date.now(),
          });
        }
      });

      if (state.currentlyExecuting) {
        state.currentlyExecuting.abortController.abort(reason ?? "Abort requested");
      }
    });
  }

  private startNextExecution(agent: Agent): void {
    const state = agent.getState(AgentExecutionState);
    if (state.currentlyExecuting || state.inputQueue.length === 0) return;

    const item = state.inputQueue[0];

    const agentCommandService = agent.requireServiceByType(AgentCommandService);
    const agentLifecycleService = agent.getServiceByType(AgentLifecycleService);


    const itemAbortController = new AbortController();
    const handleAgentAbort = () => itemAbortController.abort();
    agent.agentShutdownSignal.addEventListener('abort', handleAgentAbort);

    agent.mutateState(AgentExecutionState, (s) => {
      s.currentlyExecuting = { requestId: item.requestId, abortController: itemAbortController };
    });

    agent.app.trackPromise(this, async () => {
      try {
        const message = await agentCommandService.executeAgentCommand(agent, item.message);
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
        const status = itemAbortController.signal.aborted ? "cancelled" : "error";

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
      } finally {
        agent.agentShutdownSignal.removeEventListener('abort', handleAgentAbort);
        agent.mutateState(AgentExecutionState, (s) => {
          s.currentlyExecuting = null;
          s.inputQueue = s.inputQueue.filter(i => i.requestId !== item.requestId);
        });
      }
    });
  }
}
