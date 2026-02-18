import TokenRingApp from "@tokenring-ai/app";
import StateManager from "@tokenring-ai/app/StateManager";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {v4 as uuid} from "uuid";
import {z} from "zod";
import {AgentEventEnvelope, OutputArtifactSchema, type QuestionRequest, QuestionRequestSchema, QuestionResponseSchema, ResetWhat} from "./AgentEvents.js";
import {getDefaultQuestionValue, type ResultTypeForQuestion,} from "./question.js";
import {AgentConfig, ParsedAgentConfig} from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import {AgentEventState} from "./state/agentEventState.ts";
import {AgentExecutionState} from "./state/agentExecutionState.ts";
import {CommandHistoryState} from "./state/commandHistoryState.js";
import {CostTrackingState} from "./state/costTrackingState.ts";
import {SubAgentState} from "./state/subAgentState.ts";
import {TodoState} from "./state/todoState.ts";
import {AgentCheckpointData, AgentStateSlice} from "./types.js";
import {formatAgentId} from "./util/formatAgentId.ts";

export default class Agent {
  readonly id: string = uuid();
  debugEnabled = false;
  requireServiceByType;
  getServiceByType;

  stateManager = new StateManager<AgentStateSlice<any>>();
  initializeState = this.stateManager.initializeState.bind(this.stateManager);
  mutateState = this.stateManager.mutateState.bind(this.stateManager);
  getState = this.stateManager.getState.bind(this.stateManager);
  subscribeState = this.stateManager.subscribe.bind(this.stateManager);
  waitForState = this.stateManager.waitForState.bind(this.stateManager);
  timedWaitForState = this.stateManager.timedWaitForState.bind(this.stateManager);
  subscribeStateAsync = this.stateManager.subscribeAsync.bind(this.stateManager);

  private agentShutdownController = new AbortController();

  constructor(readonly app: TokenRingApp, readonly config: ParsedAgentConfig) {
    this.requireServiceByType = this.app.requireService;
    this.getServiceByType = this.app.getService;
    this.debugEnabled = config.debug;

    this.initializeState(AgentEventState, {});
    this.initializeState(AgentExecutionState, {});
    this.initializeState(CommandHistoryState, {});
    this.initializeState(CostTrackingState, {});
    this.initializeState(TodoState, config);
    this.initializeState(SubAgentState, config);

    this.emit({ type: "agent.created", timestamp: Date.now(), message: config.createMessage });

    for (const service of app.getServices()) {
      service.attach?.(this);
    }
  }

  get headless() {
    return this.config.headless;
  }

  get name() {
    return this.config.name;
  }

  static async createAgentFromCheckpoint(app: TokenRingApp, checkpoint: AgentCheckpointData, config: Partial<ParsedAgentConfig>) {
    const agent = new Agent(app, {
      ...checkpoint.config,
      createMessage: `Recovered agent of type: ${checkpoint.config.agentType} from checkpoint of agent ${formatAgentId(checkpoint.agentId)}`,
      ...config
    });

    agent.restoreState(checkpoint.state);

    return agent;
  }

  shutdown(reason: string) {
    this.requestAbort(reason);

    this.agentShutdownController.abort();
  }


  generateCheckpoint(): AgentCheckpointData {
    return {
      agentId: this.id,
      createdAt: Date.now(),
      config: this.config,
      state: this.stateManager.serialize()
    };
  }

  restoreState(state: AgentCheckpointData["state"]) {
    this.stateManager.deserialize(state, (key) => {
      this.warningMessage(`State slice ${key} not found in agent state`);
    });
  }

  runCommand(command: string) {
    return this.requireServiceByType(AgentCommandService).executeAgentCommand(this, command);
  }

  getAgentConfigSlice<T extends z.ZodTypeAny>(key: string, schema: T): z.infer<T> {
    try {
      return schema.parse(this.config[key as keyof AgentConfig]);
    } catch (error) {
      throw new Error(
        `Invalid config value for key "${key}": ${(error as Error).message}`,
      );
    }
  }

  addCost(category: string, amount: number) {
    this.mutateState(CostTrackingState, (state) => {
      state.costs[category] = (state.costs[category] ?? 0) + amount;
    });
  }


  /**
   * Handle input from the user.
   * @param message
   * @returns A unique request ID for the input. This can be used to track the status of the request, e.g. to cancel it.
   */
  handleInput({message}: { message: string }): string {
    const requestId = uuid();
    message = message.trim();
    
    this.mutateState(AgentEventState, (state) => {
      state.emit({type: "input.received", message, requestId, timestamp: Date.now()});
    });

    this.mutateState(CommandHistoryState, (state) => {
      state.commands.push(message);
    });

    return requestId;
  }


  chatOutput(message: string) {
    this.emit({ type: "output.chat", message, timestamp: Date.now() });
  }

  reasoningOutput(message: string) {
    this.emit({ type: "output.reasoning", message, timestamp: Date.now() });
  }

  getIdleDuration(): number {
    const events = this.getState(AgentEventState).events;

    const lastActivityTime = events[events.length - 1]?.timestamp;

    return lastActivityTime ? Date.now() - lastActivityTime : Infinity;
  }

  getRunDuration(): number {
    const events = this.getState(AgentEventState).events;

    const firstActivityTime = events[0]?.timestamp;
    return firstActivityTime ? Date.now() - firstActivityTime : 0
  }

  requestAbort(message: string) {
    this.mutateState(AgentEventState, (state) => {
      state.emit({type: "abort", timestamp: Date.now(), message});
    });
  }

  reset(what: ResetWhat[]) {
    this.stateManager.forEach(item => item.reset?.(what))
    this.emit({ type: "reset", what, timestamp: Date.now() });
  }

  async askForApproval({ message, label = "Approve ?", default: defaultValue, timeout: autoSubmitAfter }: { message: string, label?: string, default?: boolean, timeout?: number }) : Promise<boolean> {
    const result = await this.askQuestion({
      message,
      question: {
        type: 'treeSelect',
        label: label,
        minimumSelections: 1,
        maximumSelections: 1,
        defaultValue: defaultValue === undefined ? [] : [defaultValue ? 'Approved' : 'Not approved'],
        tree: [
          {
            name: "Yes", value: 'Approved'
          },
          {
            name: "No", value: 'Not approved'
          }
        ],
      },
      autoSubmitAfter
    });

    return result !== null && result.length > 0 && result[0] === 'Approved';
  }

  async askForText({ message, label, masked} : { message: string, label: string, masked?: boolean }) : Promise<string> {
    const result = await this.askQuestion({
      message,
      question: {
        type: 'text',
        label,
        masked
      }
    });
    return result || '';
  }

  async askQuestion<T extends Omit<QuestionRequest,"type" | "requestId" | "timestamp">>(question: T): Promise<ResultTypeForQuestion<T["question"]>>  {
    if (this.config.headless) {
      throw new Error("Cannot ask human for feedback when agent is running in headless mode");
    }

    let requestId = uuid();

    const eventCursor = this.mutateState(AgentEventState, (state) => {
      state.emit(QuestionRequestSchema.parse({ type: 'question.request', requestId, timestamp: Date.now(), ...question }));
      return state.getEventCursorFromCurrentPosition();
    });

    for await (const state of this.subscribeStateAsync(AgentEventState, this.agentShutdownController.signal)) {
      for (const event of state.yieldEventsByCursor(eventCursor)) {
        if (event.type === "question.response" && event.requestId === requestId) {
          return event.result;
        }
      }
    }
    throw new Error("Agent shutdown while waiting for question response");
  }

  async busyWhile<T>(message: string, awaitable: Promise<T> | (() => Promise<T>)): Promise<T> {
    if (typeof awaitable === "function") awaitable = awaitable();
    this.mutateState(AgentExecutionState, (state) => state.busyWith = message);
    try {
      return await awaitable;
    } finally {
      this.mutateState(AgentExecutionState, (state) => state.busyWith = null);
    }
  }

  setBusyWith(message: string | null) {
    this.mutateState(AgentExecutionState, (state) => {
      state.busyWith = message;
    })
  }

  setStatusLine(status: string | null) {
    this.mutateState(AgentExecutionState, (state) => {
      state.statusLine = status;
    })
  }

  infoMessage = (...messages: string[]) =>
    this.emit({ type: "output.info", message: formatLogMessages(messages), timestamp: Date.now() });

  warningMessage = (...messages: string[]) =>
    this.emit({ type: "output.warning", message: formatLogMessages(messages), timestamp: Date.now() });

  errorMessage = (...messages: (string | Error)[]) =>
    this.emit({ type: "output.error", message: formatLogMessages(messages), timestamp: Date.now() });

  debugMessage = (...messages: string[]) => {
    if (this.debugEnabled) {
      this.emit({ type: "output.info", message: formatLogMessages(messages), timestamp: Date.now() });
    }
  };
  artifactOutput({name, encoding, mimeType, body}: Omit<z.input<typeof OutputArtifactSchema>, "type" | "timestamp">) {
    this.mutateState(AgentEventState, (state) => {
      state.events.push({ type: 'output.artifact', name, encoding, mimeType, body, timestamp: Date.now() });
    });
  }

  sendQuestionResponse = (requestId: string, response: Omit<z.infer<typeof QuestionResponseSchema>, "type" | "requestId" | "timestamp">) => {
    this.mutateState(AgentEventState, (state) => {
      state.events.push({type: "question.response", requestId, ...response, timestamp: Date.now()});
    });
  };

  getAbortSignal() {
    const state = this.getState(AgentExecutionState);
    return state.currentlyExecuting?.abortController.signal || this.agentShutdownController.signal;
  }

  async run(signal: AbortSignal): Promise<void> {
    signal.addEventListener('abort', () => this.agentShutdownController.abort());

    if (this.config.initialCommands.length > 0) {
      this.mutateState(AgentEventState, (state) => {
        for (const message of this.config.initialCommands) {
          state.events.push({type: "input.received", message: message.trim(), requestId: uuid(), timestamp: Date.now()});
        }
      })
    }

    const eventCursor = { position: 0 };

    for await (const state of this.subscribeStateAsync(AgentEventState, this.agentShutdownController.signal)) {
      for (const event of state.yieldEventsByCursor(eventCursor)) {
        if (event.type === "input.received") {
          this.mutateState(AgentExecutionState, (s) => {
            s.inputQueue.push(event);
          });
        } else if (event.type === "abort") {
          this.handleAbort();
        } else if (event.type === 'question.request' ) {
          this.mutateState(AgentExecutionState, (s) => {
            s.waitingOn.push(event);
            if (event.autoSubmitAfter > 0) {
              const requestId = event.requestId;
              const autoSubmitAfterMs = event.autoSubmitAfter * 1000;
              setTimeout(() => {
                this.mutateState(AgentEventState, (s) => {
                  for (const e of s.events) {
                    if ((e.type === 'question.response') && e.requestId === requestId) return;
                  }

                  s.events.push({ type: 'question.response', requestId, result: getDefaultQuestionValue(event.question), timestamp: Date.now() });
                });
              }, autoSubmitAfterMs);
            }
          });
        } else if (event.type === "question.response") {
          this.mutateState(AgentExecutionState, (s) => {
            s.waitingOn = s.waitingOn.filter(item => item.requestId !== event.requestId);
          })
        }
      }
      
      this.startNextExecution();
    }

    this.emit({
      type: "agent.stopped",
      message: signal.aborted ? "Agent was aborted" : "Agent stopped normally",
      timestamp: Date.now()
    });


    for (const service of this.app.getServices()) {
      service.detach?.(this);
    }
  }

  private handleAbort(reason?: string): void {
    this.mutateState(AgentExecutionState, (state) => {
      const requestId = state.currentlyExecuting?.requestId;

      state.inputQueue.splice(0, state.inputQueue.length);

      this.mutateState(AgentEventState, (eventState) => {
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

  private startNextExecution(): void {
    const state = this.getState(AgentExecutionState);
    if (state.currentlyExecuting || state.inputQueue.length === 0) return;

    const item = state.inputQueue[0];

    const agentCommandService = this.requireServiceByType(AgentCommandService);
    const agentLifecycleService = this.getServiceByType(AgentLifecycleService);


    const itemAbortController = new AbortController();
    const handleAgentAbort = () => itemAbortController.abort();
    this.agentShutdownController.signal.addEventListener('abort', handleAgentAbort);

    this.mutateState(AgentExecutionState, (s) => {
      s.currentlyExecuting = { requestId: item.requestId, abortController: itemAbortController };
    });

    this.app.trackPromise(async () => {
      try {
        await agentCommandService.executeAgentCommand(this, item.message);
        await agentLifecycleService?.executeHooks(this, "afterAgentInputComplete", item.message);

        this.mutateState(AgentEventState, (s) => {
          s.emit({
            type: "input.handled",
            requestId: item.requestId,
            status: "success",
            message: "Request completed successfully",
            timestamp: Date.now(),
          });
        });
      } catch (err) {
        const status = itemAbortController.signal.aborted ? "cancelled" : "error";
        this.mutateState(AgentEventState, (s) => {
          s.emit({
            type: "input.handled",
            requestId: item.requestId,
            status,
            message: formatLogMessages([err as Error]),
            timestamp: Date.now(),
          });
        });
      } finally {
        this.agentShutdownController.signal.removeEventListener('abort', handleAgentAbort);
        this.mutateState(AgentExecutionState, (s) => {
          s.currentlyExecuting = null;
          s.inputQueue = s.inputQueue.filter(i => i.requestId !== item.requestId);
        });
      }
    });
  }


  private emit(event: AgentEventEnvelope): void {
    this.mutateState(AgentEventState, (state) => state.emit(event));
  }
}
