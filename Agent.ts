import TokenRingApp from "@tokenring-ai/app";
import StateManager from "@tokenring-ai/app/StateManager";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {v4 as uuid} from "uuid";
import {z} from "zod";
import {
  AgentEventEnvelope,
  type BareInputReceivedMessage,
  OutputArtifactSchema,
  type QuestionRequest,
  QuestionRequestSchema,
  QuestionResponseSchema
} from "./AgentEvents.js";
import {getDefaultQuestionValue, type ResultTypeForQuestion} from "./question.js";
import {AgentConfig, ParsedAgentConfig} from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.js";
import {AgentEventState} from "./state/agentEventState.ts";
import {CommandHistoryState} from "./state/commandHistoryState.js";
import {CostTrackingState} from "./state/costTrackingState.ts";
import {SubAgentState} from "./state/subAgentState.ts";
import {TodoState} from "./state/todoState.ts";
import {AgentCheckpointData, AgentStateSlice} from "./types.js";

export default class Agent {
  readonly id: string = uuid();
  debugEnabled = false;
  requireServiceByType;
  getServiceByType;

  stateManager: StateManager<AgentStateSlice<any>>;
  initializeState;
  mutateState;
  getState;
  subscribeState;
  waitForState;
  subscribeStateAsync;

  constructor(readonly app: TokenRingApp, readonly initialState: Record<string, unknown>, readonly config: ParsedAgentConfig, readonly agentShutdownSignal: AbortSignal) {
    this.stateManager = new StateManager<AgentStateSlice<any>>(initialState);
    this.requireServiceByType = this.app.requireService;
    this.getServiceByType = this.app.getService;
    this.debugEnabled = config.debug;

    this.initializeState = this.stateManager.initializeState.bind(this.stateManager);
    this.mutateState = this.stateManager.mutateState.bind(this.stateManager);
    this.getState = this.stateManager.getState.bind(this.stateManager);
    this.subscribeState = this.stateManager.subscribe.bind(this.stateManager);
    this.waitForState = this.stateManager.waitForState.bind(this.stateManager);
    this.subscribeStateAsync = this.stateManager.subscribeAsync.bind(this.stateManager);

    this.initializeState(AgentEventState, {});
    this.initializeState(CommandHistoryState, {});
    this.initializeState(CostTrackingState, {});
    this.initializeState(TodoState, config);
    this.initializeState(SubAgentState, config);

  }

  get headless() {
    return this.config.headless;
  }

  get displayName() {
    return this.config.displayName;
  }

  generateCheckpoint(): AgentCheckpointData {
    return {
      agentId: this.id,
      createdAt: Date.now(),
      sessionId: this.app.sessionId,
      agentType: this.config.agentType,
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
   * @param input
   * @returns A unique request ID for the input. This can be used to track the status of the request, e.g. to cancel it.
   */
  handleInput(input: BareInputReceivedMessage): string {
    const requestId = uuid();

    this.mutateState(AgentEventState, (state) => {
      state.emit({type: "input.received", requestId, timestamp: Date.now(), ...input});
    });

    this.mutateState(CommandHistoryState, (state) => {
      state.commands.push(input.message);
    });

    return requestId;
  }

  chatOutput(message: string) {
    this.emit({type: "output.chat", message, timestamp: Date.now()});
  }

  reasoningOutput(message: string) {
    this.emit({type: "output.reasoning", message, timestamp: Date.now()});
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

  requestPause(message: string) {
    this.mutateState(AgentEventState, (state) => {
      state.emit({type: "pause", timestamp: Date.now(), message});
    });
  }

  requestResume(message: string) {
    this.mutateState(AgentEventState, (state) => {
      state.emit({type: "resume", timestamp: Date.now(), message});
    });
  }

  async askForApproval({message, label = "Approve ?", default: defaultValue, timeout: autoSubmitAfter}: {
    message: string,
    label?: string,
    default?: boolean,
    timeout?: number
  }): Promise<boolean | null> {
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

  async askForText({message, label, masked}: { message: string, label: string, masked?: boolean }): Promise<string | null> {
    return await this.askQuestion({
      message,
      question: {
        type: 'text',
        label,
        masked
      }
    });
  }

  async askQuestion<T extends Omit<QuestionRequest, "type" | "requestId" | "timestamp">>(question: T): Promise<ResultTypeForQuestion<T["question"]> | null> {
    if (this.config.headless) {
      throw new Error("Cannot ask human for feedback when agent is running in headless mode");
    }

    let requestId = uuid();
    const event = QuestionRequestSchema.parse({type: 'question.request', requestId, timestamp: Date.now(), ...question});

    const eventCursor = this.mutateState(AgentEventState, (state) => {
      state.emit(event);
      return state.getEventCursorFromCurrentPosition();
    });

    if (event.autoSubmitAfter > 0) {
      const autoSubmitAfterMs = event.autoSubmitAfter * 1000;
      setTimeout(() => {
        this.mutateState(AgentEventState, (s) => {
          for (const e of s.events) {
            if ((e.type === 'question.response') && e.requestId === requestId) return;
          }

          s.emit({type: 'question.response', requestId, result: getDefaultQuestionValue(event.question), timestamp: Date.now()});
        });
      }, autoSubmitAfterMs);
    }

    for await (const state of this.subscribeStateAsync(AgentEventState, this.agentShutdownSignal)) {
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

    let prevBusyWith: string | null;
    this.mutateState(AgentEventState, (state) => {
      prevBusyWith = state.latestExecutionState.busyWith;
      state.updateExecutionState({busyWith: prevBusyWith ? `${prevBusyWith} & ${message}` : message});
    })
    try {
      return await awaitable;
    } finally {
      this.mutateState(AgentEventState, (state) => {
        state.updateExecutionState({busyWith: prevBusyWith});
      })
    }
  }

  setBusyWith(message: string | null) {
    this.mutateState(AgentEventState, (state) => {
      state.updateExecutionState({busyWith: message});
    })
  }

  updateStatus(statusMessage: string) {
    this.emit({ type: 'status', message: statusMessage, timestamp: Date.now()});
  }

  infoMessage = (...messages: string[]) =>
    this.emit({type: "output.info", message: formatLogMessages(messages), timestamp: Date.now()});

  warningMessage = (...messages: string[]) =>
    this.emit({type: "output.warning", message: formatLogMessages(messages), timestamp: Date.now()});

  errorMessage = (...messages: (string | Error)[]) =>
    this.emit({type: "output.error", message: formatLogMessages(messages), timestamp: Date.now()});

  debugMessage = (...messages: string[]) => {
    if (this.debugEnabled) {
      this.emit({type: "output.info", message: formatLogMessages(messages), timestamp: Date.now()});
    }
  };

  artifactOutput({name, encoding, mimeType, body}: Omit<z.input<typeof OutputArtifactSchema>, "type" | "timestamp">) {
    this.emit({type: 'output.artifact', name, encoding, mimeType, body, timestamp: Date.now()});
  }

  sendQuestionResponse = (requestId: string, response: Omit<z.infer<typeof QuestionResponseSchema>, "type" | "requestId" | "timestamp">) => {
    this.emit({type: "question.response", requestId, ...response, timestamp: Date.now()});
  };

  getAbortSignal() {
    const state = this.getState(AgentEventState);
    return state.currentExecutionAbortController?.signal || this.agentShutdownSignal;
  }

  runBackgroundTask(task: (signal: AbortSignal) => Promise<void>) {
    task(this.agentShutdownSignal)
      .catch(error => {
        this.errorMessage("Error while running background task", error as Error);
      });
  }

  private emit(event: AgentEventEnvelope): void {
    this.mutateState(AgentEventState, (state) => state.emit(event));
  }
}
