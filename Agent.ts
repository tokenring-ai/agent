import type TokenRingApp from "@tokenring-ai/app";
import StateManager from "@tokenring-ai/app/StateManager";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {generateHumanId} from "@tokenring-ai/utility/string/generateHumanId";
import {setTimeout as delay} from "node:timers/promises";
import {v4 as uuid} from "uuid";
import type {z} from "zod";
import {
  type AgentEventEnvelope,
  type InputMessage,
  type InteractionResponse,
  InteractionSchema,
  type OutputArtifactSchema,
  type QuestionInteractionSchema,
} from "./AgentEvents.js";
import {getDefaultQuestionValue, type ResultTypeForQuestion,} from "./question.ts";
import type {AgentConfig, ParsedAgentConfig} from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.ts";
import {AgentEventState} from "./state/agentEventState.ts";
import {CommandHistoryState} from "./state/commandHistoryState.ts";
import type {AgentCheckpointData, AgentStateSlice} from "./types.ts";

export default class Agent {
  readonly id: string = generateHumanId();
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

  constructor(
    readonly app: TokenRingApp,
    readonly initialState: Record<string, unknown>,
    readonly config: ParsedAgentConfig,
    readonly agentShutdownSignal: AbortSignal,
  ) {
    this.stateManager = new StateManager<AgentStateSlice<any>>(initialState);
    this.requireServiceByType = this.app.requireService;
    this.getServiceByType = this.app.getService;
    this.debugEnabled = config.debug;

    this.initializeState = this.stateManager.initializeState.bind(
      this.stateManager,
    );
    this.mutateState = this.stateManager.mutateState.bind(this.stateManager);
    this.getState = this.stateManager.getState.bind(this.stateManager);
    this.subscribeState = this.stateManager.subscribe.bind(this.stateManager);
    this.waitForState = this.stateManager.waitForState.bind(this.stateManager);
    this.subscribeStateAsync = this.stateManager.subscribeAsync.bind(
      this.stateManager,
    );

    this.initializeState(AgentEventState, {});
    this.initializeState(CommandHistoryState, {});
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
      state: this.stateManager.serialize(),
    };
  }

  restoreState(state: AgentCheckpointData["state"]) {
    this.stateManager.deserialize(state, (key) => {
      this.warningMessage(`State slice ${key} not found in agent state`);
    });
  }

  runCommand(command: string) {
    return this.requireServiceByType(AgentCommandService).executeAgentCommand(
      this,
      command,
    );
  }

  getAgentConfigSlice<T extends z.ZodTypeAny>(
    key: string,
    schema: T,
  ): z.infer<T> {
    try {
      return schema.parse(this.config[key as keyof AgentConfig]);
    } catch (error) {
      throw new Error(
        `Invalid config value for key "${key}": ${(error as Error).message}`,
        {cause: error},
      );
    }
  }

  /**
   * Handle input from the user.
   * @param input
   * @returns A unique request ID for the input. This can be used to track the status of the request, e.g. to cancel it.
   */
  handleInput(input: InputMessage): string {
    const requestId = generateHumanId();

    this.mutateState(AgentEventState, (state) => {
      state.emit({
        type: "input.received",
        requestId,
        timestamp: Date.now(),
        input,
      });
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
    return firstActivityTime ? Date.now() - firstActivityTime : 0;
  }

  abortCurrentOperation(reason: string): boolean {
    return this.mutateState(AgentEventState, (state) => {
      if (state.currentlyExecutingInputItem) {
        state.currentlyExecutingInputItem.abortController.abort(reason);
        return true;
      }
      return false;
    });
  }

  async askForApproval({
                         message,
                         label = "Approve ?",
                         default: defaultValue,
                         timeout: autoSubmitAfter,
                       }: {
    message: string;
    label?: string;
    default?: boolean;
    timeout?: number;
  }): Promise<boolean | null> {
    const result = await this.askQuestion({
      message,
      question: {
        type: "treeSelect",
        label: label,
        minimumSelections: 1,
        maximumSelections: 1,
        defaultValue:
          defaultValue === undefined
            ? []
            : [defaultValue ? "Approved" : "Not approved"],
        tree: [
          {
            name: "Yes",
            value: "Approved",
          },
          {
            name: "No",
            value: "Not approved",
          },
        ],
      },
      autoSubmitAfter,
    });

    return result !== null && result.length > 0 && result[0] === "Approved";
  }

  async askForText({
                     message,
                     label,
                     masked,
                   }: {
    message: string;
    label: string;
    masked?: boolean;
  }): Promise<string | null> {
    return await this.askQuestion({
      message,
      question: {
        type: "text",
        label,
        masked,
      },
    });
  }

  async askQuestion<
    T extends Omit<
      z.input<typeof QuestionInteractionSchema>,
      "type" | "requestId" | "timestamp" | "interactionId"
    >,
  >(question: T): Promise<ResultTypeForQuestion<T["question"]> | null> {
    if (this.config.headless) {
      throw new Error(
        "Cannot ask human for feedback when agent is running in headless mode",
      );
    }
    return ((await this.waitForInteraction({
      type: "question",
      ...question,
    })) ?? null) as ResultTypeForQuestion<T["question"]> | null;
  }

  async waitForInteraction(
    interaction: Omit<
      z.input<typeof InteractionSchema>,
      "requestId" | "timestamp" | "interactionId"
    >,
  ): Promise<unknown> {
    const requestId = uuid();
    const interactionId = uuid();
    const event = InteractionSchema.parse({
      ...interaction,
      requestId,
      interactionId,
      timestamp: Date.now(),
    } as z.input<typeof InteractionSchema>);

    const resultPromise = new Promise((resolve, reject) => {
      this.mutateState(AgentEventState, (state) => {
        if (state.currentlyExecutingInputItem) {
          const inputItem = state.currentlyExecutingInputItem;
          const availableInteractions =
            (inputItem.executionState.availableInteractions ??= []);
          availableInteractions.push(event);

          inputItem.interactionCallbacks.set(interactionId, resolve);
          state.pushInputExecution(inputItem);

          const signal = inputItem.abortController.signal;
          signal.addEventListener(
            "abort",
            () => {
              reject(signal.reason);
            },
            {once: true},
          );
        } else {
          throw new Error(
            "Cannot initiate and interaction with the user when no currently executing input item is available",
          );
        }
      });
    });

    try {
      if ("autoSubmitAt" in event && event.autoSubmitAt) {
        const delayMs = Math.max(0, event.autoSubmitAt - Date.now());

        return await Promise.race([
          resultPromise,
          delay(delayMs).then(() => getDefaultQuestionValue(event.question)),
        ]);
      }

      return await resultPromise;
    } finally {
      this.mutateState(AgentEventState, (state) => {
        const inputItem = state.currentlyExecutingInputItem;
        if (!inputItem) return;

        inputItem.interactionCallbacks.delete(interactionId);
        const previousLength =
          inputItem.executionState.availableInteractions.length;
        inputItem.executionState.availableInteractions =
          inputItem.executionState.availableInteractions.filter(
            (availableInteraction) =>
              availableInteraction.interactionId !== interactionId,
          );

        if (
          inputItem.executionState.availableInteractions.length !==
          previousLength
        ) {
          state.pushInputExecution(inputItem);
        }
      });
    }
  }

  async busyWithActivity<T>(
    message: string,
    awaitable: Promise<T> | (() => Promise<T>),
  ): Promise<T> {
    if (typeof awaitable === "function") awaitable = awaitable();

    let prevActivity: string;
    const currentItem = this.mutateState(AgentEventState, (state) => {
      if (state.currentlyExecutingInputItem) {
        prevActivity =
          state.currentlyExecutingInputItem.executionState.currentActivity;
        state.currentlyExecutingInputItem.executionState.currentActivity =
          message;
        state.pushInputExecution(state.currentlyExecutingInputItem);
        return state.currentlyExecutingInputItem;
      } else {
        throw new Error(
          "busyWhile was called outside of a currently executing task in the Agent event loop, which is not allowed.",
        );
      }
    });

    try {
      return await awaitable;
    } finally {
      this.mutateState(AgentEventState, (state) => {
        if (state.currentlyExecutingInputItem === currentItem) {
          currentItem.executionState.currentActivity = prevActivity;
          state.pushInputExecution(currentItem);
        } else {
          throw new Error(
            "The currently executing input item mutated while busyWhile was running in the Agent event loop, which is not allowed.",
          );
        }
      });
    }
  }

  setCurrentActivity(message: string) {
    this.mutateState(AgentEventState, (state) => {
      if (state.currentlyExecutingInputItem) {
        state.currentlyExecutingInputItem.executionState.currentActivity =
          message;
        state.pushInputExecution(state.currentlyExecutingInputItem);
      } else {
        throw new Error(
          "setBusyWith was called outside of a currently executing task in the Agent event loop, which is not allowed.",
        );
      }
    });
  }

  infoMessage = (...messages: string[]) =>
    this.emit({
      type: "output.info",
      message: formatLogMessages(messages),
      timestamp: Date.now(),
    });

  warningMessage = (...messages: string[]) =>
    this.emit({
      type: "output.warning",
      message: formatLogMessages(messages),
      timestamp: Date.now(),
    });

  errorMessage = (...messages: (string | Error)[]) =>
    this.emit({
      type: "output.error",
      message: formatLogMessages(messages),
      timestamp: Date.now(),
    });

  debugMessage = (...messages: string[]) => {
    if (this.debugEnabled) {
      this.emit({
        type: "output.info",
        message: formatLogMessages(messages),
        timestamp: Date.now(),
      });
    }
  };

  artifactOutput({
                   name,
                   encoding,
                   mimeType,
                   body,
                 }: Omit<z.input<typeof OutputArtifactSchema>, "type" | "timestamp">) {
    this.emit({
      type: "output.artifact",
      name,
      encoding,
      mimeType,
      body,
      timestamp: Date.now(),
    });
  }

  sendInteractionResponse = (
    response: Omit<InteractionResponse, "type" | "timestamp">,
  ) => {
    this.emit({
      type: "input.interaction",
      ...response,
      timestamp: Date.now(),
    });
  };

  getAbortSignal() {
    const state = this.getState(AgentEventState);
    if (state.currentlyExecutingInputItem) {
      return state.currentlyExecutingInputItem.abortController.signal;
    } else {
      throw new Error(
        "Cannot get abort signal when no currently executing input item is available",
      );
    }
  }

  runBackgroundTask(task: (signal: AbortSignal) => Promise<void>) {
    Promise.resolve()
      .then(() => task(this.agentShutdownSignal))
      .catch((error) => {
        this.errorMessage(
          "Error while running background task",
          error as Error,
        );
      });
  }

  private emit(event: AgentEventEnvelope): void {
    this.mutateState(AgentEventState, (state) => state.emit(event));
  }
}
