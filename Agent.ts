import { setTimeout as delay } from "node:timers/promises";
import type TokenRingApp from "@tokenring-ai/app";
import StateManager from "@tokenring-ai/app/StateManager";
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import type { Arrayable } from "@tokenring-ai/utility/array/arrayable";
import { formatDurationMs } from "@tokenring-ai/utility/date/formatDuration";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import { generateHumanId } from "@tokenring-ai/utility/string/generateHumanId";
import { truncateText } from "@tokenring-ai/utility/string/truncateText";
import { v4 as uuid } from "uuid";
import type { z } from "zod";
import {
  type AgentEventEnvelope,
  type InputMessage,
  type InteractionResponse,
  InteractionSchema,
  type QuestionInteractionSchema,
  type ToolCallResult,
  ToolCallResultSchema,
} from "./AgentEvents.js";
import { BeforeInputReceived } from "./lifecycle.ts";
import { ALWAYS_ALLOW_VALUE, getDefaultQuestionValue, QuestionSchema, type ResultTypeForQuestion } from "./question.ts";
import type { AgentConfig, ParsedAgentConfig } from "./schema.ts";
import AgentJobService from "./services/AgentJobService.ts";
import AgentManager from "./services/AgentManager.ts";
import { AgentEventState } from "./state/agentEventState.ts";
import { CommandHistoryState } from "./state/commandHistoryState.ts";
import type { AgentCheckpointData, AgentStateSlice } from "./types.ts";

/** Longest the BeforeInputReceived hooks may hold up an input before it is queued without them. */
const INPUT_HOOK_TIMEOUT_MS = 60_000;

/** An abort reason as an Error, so code catching a cancelled question can read `.message`. */
function abortError(reason: unknown): Error {
  return Error.isError(reason) ? reason : new Error(typeof reason === "string" ? reason : "The operation was cancelled");
}

type QuestionInput = Omit<z.input<typeof QuestionInteractionSchema>, "type" | "requestId" | "timestamp" | "interactionId">;

/** How {@link Agent.askQuestion} settles a question nobody answers in time (or nobody can answer). */
export type AskQuestionOptions<R> = {
  /**
   * The answer taken when the deadline passes. Defaults to the question's own default value when it
   * has one (a non-empty text or selection), else null — "no answer".
   */
  whenUnanswered?: R | null;
  /** How the transcript note describes that answer, e.g. "refused". Defaults to "used the default" / "went on without an answer". */
  unansweredNote?: string;
  /** Called when the question took its unanswered default (nobody can answer, or the deadline passed). */
  onUnanswered?: () => void;
  /**
   * Set by approvals, which record their own refusals on the job: skips noting this question as
   * "answered by default" on the job record. Other questions are noted there automatically.
   */
  isApproval?: boolean;
};

/** The answer a question took by default, as short text for a job record. */
function describeAnswer(answer: unknown): string {
  if (answer === null || answer === undefined) return "(no answer)";
  const text = Array.isArray(answer) ? answer.join(", ") : typeof answer === "string" ? answer : JSON.stringify(answer);
  return truncateText(text.trim() === "" ? "(empty)" : text, 200);
}

/** The answer a question settles on when nobody answers: its own default if it has one, else null. */
function questionDefault(question: QuestionInput["question"]): unknown {
  const parsed = QuestionSchema.parse(question);
  switch (parsed.type) {
    case "text":
      return parsed.defaultValue === "" ? null : parsed.defaultValue;
    case "treeSelect":
    case "fileSelect":
      return parsed.defaultValue.length > 0 ? parsed.defaultValue : null;
    default:
      return null;
  }
}

/** A short name for a question in a transcript note: its first line. */
function questionSummary(question: QuestionInput): string {
  const firstLine = question.message.split("\n").find(line => line.trim() !== "") ?? "";
  const label = "label" in question.question ? question.question.label : "";
  return truncateText(firstLine || label || "Question", 120);
}

const UNANSWERED = Symbol("unanswered");

export default class Agent {
  readonly id: string;
  /** Inputs whose BeforeInputReceived hooks are still running; see {@link cancelInput}. */
  private readonly preparingInputs = new Map<string, { cancelled: boolean }>();
  private inputPreparation: Promise<void> = Promise.resolve();
  readonly createdAt: number = Date.now();
  debugEnabled = false;
  requireService;
  getService;

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
    /** The agent that spawned this one as a sub-agent; null for agents started on their own. */
    readonly parentAgentId: string | null = null,
    /** Reuses an id, for an agent restored from a checkpoint; a new id when omitted. */
    id?: string,
  ) {
    this.id = id ?? generateHumanId();
    this.stateManager = new StateManager<AgentStateSlice<any>>(initialState);
    this.requireService = this.app.requireService;
    this.getService = this.app.getService;
    this.debugEnabled = config.debug;

    this.initializeState = this.stateManager.initializeState.bind(this.stateManager);
    this.mutateState = this.stateManager.mutateState.bind(this.stateManager);
    this.getState = this.stateManager.getState.bind(this.stateManager);
    this.subscribeState = this.stateManager.subscribe.bind(this.stateManager);
    this.waitForState = this.stateManager.waitForState.bind(this.stateManager);
    this.subscribeStateAsync = this.stateManager.subscribeAsync.bind(this.stateManager);

    this.initializeState(AgentEventState, {});
    this.initializeState(CommandHistoryState, {});
  }

  /**
   * How long this agent's questions wait for an answer, set by whoever starts the agent (not its type):
   * null waits until someone answers, 0 means nobody can answer — every question takes its default at
   * once — and undefined follows the parent agent. Read the effective value with {@link getAnswerTimeoutSeconds}.
   */
  answerTimeoutSeconds: number | null | undefined = undefined;

  /** The effective answer deadline: this agent's own setting, else its nearest parent's, else null (wait). */
  getAnswerTimeoutSeconds(): number | null {
    if (this.answerTimeoutSeconds !== undefined) return this.answerTimeoutSeconds;
    const agentManager = this.getService(AgentManager);
    const seen = new Set<string>([this.id]);
    let parentId = this.parentAgentId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = agentManager?.getAgent(parentId);
      if (!parent) break;
      if (parent.answerTimeoutSeconds !== undefined) return parent.answerTimeoutSeconds;
      parentId = parent.parentAgentId;
    }
    return null;
  }

  get displayName() {
    return this.config.displayName;
  }

  /** A snapshot of the agent's state: now, or as it stood at `at` (a branch from an earlier point in the conversation). */
  generateCheckpoint(at?: number): AgentCheckpointData {
    return {
      agentId: this.id,
      createdAt: Date.now(),
      sessionId: this.app.sessionId,
      agentType: this.config.agentType,
      parentAgentId: this.parentAgentId,
      state:
        at === undefined
          ? this.stateManager.serialize()
          : Object.fromEntries([...this.stateManager.slices()].map(slice => [slice.name, slice.serializeAt(at)])),
    };
  }

  restoreState(state: AgentCheckpointData["state"]) {
    this.stateManager.deserialize(state, key => {
      this.warningMessage(`State slice ${key} not found in agent state`);
    });
  }

  getAgentConfigSlice<T extends z.ZodType>(key: string, schema: T): z.infer<T> {
    try {
      return schema.parse(this.config[key as keyof AgentConfig]);
    } catch (error: unknown) {
      throw new Error(`Invalid config value for key "${key}": ${(error as Error).message}`, { cause: error });
    }
  }

  /**
   * Handle input from the user.
   * @param input
   * @returns A unique request ID for the input. This can be used to track the status of the request, e.g. to cancel it.
   */
  handleInput(input: InputMessage): string {
    if (this.agentShutdownSignal.aborted) {
      throw new Error(`Agent ${this.displayName} has been shut down and can't take new input.`);
    }
    const requestId = generateHumanId();

    this.mutateState(CommandHistoryState, state => {
      state.commands.push(input.message);
    });

    const pending = { cancelled: false };
    this.preparingInputs.set(requestId, pending);
    // Hooks run for one input at a time, so inputs join the queue in the order they arrived even when
    // one input's hooks are slower than the next one's.
    this.inputPreparation = this.inputPreparation.then(() => this.prepareInput(requestId, input, pending));

    return requestId;
  }

  /**
   * Resolves once every input sent so far has been through its BeforeInputReceived hooks and is in
   * the queue (or cancelled), so `idle` can be trusted for them.
   */
  inputsPrepared(): Promise<void> {
    return this.inputPreparation;
  }

  /** Runs the BeforeInputReceived hooks for an input, then queues it (or records it as cancelled). */
  private async prepareInput(requestId: string, input: InputMessage, pending: { cancelled: boolean }): Promise<void> {
    const hook = new BeforeInputReceived(input);
    try {
      const hooks = this.getService(AgentLifecycleService)?.executeHooks(hook, this);
      if (hooks) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = await Promise.race([
          hooks.then(() => false),
          new Promise<boolean>(resolve => {
            timer = setTimeout(() => resolve(true), INPUT_HOOK_TIMEOUT_MS);
          }),
        ]);
        clearTimeout(timer);
        // A hung hook must not leave the message unsent (and the agent's later messages stuck behind it).
        if (timedOut) this.warningMessage(`Input hooks took over ${INPUT_HOOK_TIMEOUT_MS / 1000}s, so the message was sent without waiting for them.`);
      }
    } catch (error) {
      this.errorMessage("An input hook failed; the message was sent as it was:", error as Error);
    } finally {
      this.preparingInputs.delete(requestId);
      try {
        this.mutateState(AgentEventState, state => {
          state.emit({ type: "input.received", requestId, timestamp: Date.now(), input: hook.input });
        });
        // Cancelled while its hooks ran: it shows in the transcript, as cancelled.
        if (pending.cancelled) this.cancelInput(requestId, "Cancelled before it started.");
      } catch (error) {
        console.error("Could not queue input", error);
      }
    }
  }

  /**
   * Cancels an input: one still being prepared or waiting in the queue is dropped with a cancelled
   * response; the one running is aborted. False when there was nothing to cancel.
   */
  cancelInput(requestId: string, reason = "Cancelled while queued."): boolean {
    const pending = this.preparingInputs.get(requestId);
    if (pending) {
      pending.cancelled = true;
      return true;
    }
    return this.mutateState(AgentEventState, state => {
      const queuedIndex = state.inputQueue.findIndex(item => item.request.requestId === requestId);
      if (queuedIndex === -1) return false;
      if (state.currentlyExecutingInputItem?.request.requestId === requestId) {
        state.currentlyExecutingInputItem.abortController.abort("User cancelled the operation");
        return true;
      }
      state.inputQueue.splice(queuedIndex, 1);
      state.emit({ type: "agent.response", requestId, status: "cancelled", message: reason, timestamp: Date.now() });
      state.pushAgentStatus();
      return true;
    });
  }

  chatOutput(message: string) {
    this.emit({ type: "output.chat", message, timestamp: Date.now() });
  }

  reasoningOutput(message: string) {
    this.emit({ type: "output.reasoning", message, timestamp: Date.now() });
  }

  /** How long the agent has had nothing to do: 0 while it has input queued or running, however quiet that work is. */
  getIdleDuration(): number {
    const state = this.getState(AgentEventState);
    if (!state.idle) return 0;
    const lastActivityTime = Math.max(state.events[state.events.length - 1]?.timestamp ?? 0, this.createdAt);
    return Date.now() - lastActivityTime;
  }

  /** How long this agent has existed. Restored history (older timestamps) does not count. */
  getRunDuration(): number {
    return Date.now() - this.createdAt;
  }

  abortCurrentOperation(reason: string): boolean {
    return this.mutateState(AgentEventState, state => {
      if (state.currentlyExecutingInputItem) {
        state.currentlyExecutingInputItem.abortController.abort(reason);
        return true;
      }
      return false;
    });
  }

  /**
   * Asks a yes/no question. Unanswered by the agent's deadline (or at once when nobody can answer) it
   * is refused — whatever `defaultValue` says, which only preselects an answer in the UI. A
   * confirmation that should go ahead unanswered (e.g. "compact now?") passes `whenUnanswered: true`.
   */
  async askForApproval({
    message,
    label = "Allow this?",
    defaultValue,
    whenUnanswered = false,
    onUnanswered,
    alwaysAllow,
  }: {
    message: string;
    label?: string | undefined;
    defaultValue?: boolean | undefined;
    whenUnanswered?: boolean | undefined;
    /**
     * Adds a third choice, "Always allow" (do not ask again for this kind of action). Choosing it calls `onGrant` once (it saves the standing
     * permission) and the approval returns true, like Yes. Never taken when nobody answers.
     */
    alwaysAllow?: { label: string; onGrant: () => void | Promise<void> } | undefined;
    /** Called when nobody answered and the approval took its unanswered outcome (refused, unless `whenUnanswered`). */
    onUnanswered?: (() => void) | undefined;
    timeout?: never;
  }): Promise<boolean> {
    const result = await this.askQuestion(
      {
        message,
        question: {
          type: "treeSelect",
          label: label,
          minimumSelections: 1,
          maximumSelections: 1,
          defaultValue: defaultValue === undefined ? [] : [defaultValue ? "Approved" : "Not approved"],
          tree: [
            {
              name: "Approve",
              value: "Approved",
            },
            {
              name: "Not now",
              value: "Not approved",
            },
            ...(alwaysAllow ? [{ name: alwaysAllow.label, value: ALWAYS_ALLOW_VALUE }] : []),
          ],
        },
      },
      {
        whenUnanswered: whenUnanswered ? ["Approved"] : null,
        unansweredNote: whenUnanswered ? "went ahead" : "refused",
        isApproval: true,
        ...(onUnanswered && { onUnanswered }),
      },
    );

    if (alwaysAllow && result?.[0] === ALWAYS_ALLOW_VALUE) {
      await alwaysAllow.onGrant();
      return true;
    }
    return result !== null && result.length > 0 && result[0] === "Approved";
  }

  async askForText({ message, label, masked }: { message: string; label: string; masked?: boolean | undefined }): Promise<string | null> {
    return await this.askQuestion({
      message,
      question: {
        type: "text",
        label,
        masked,
      },
    });
  }

  /**
   * Asks a person a question and waits for the answer — up to the agent's deadline
   * ({@link getAnswerTimeoutSeconds}). The question is posted as an interaction (shown in the app,
   * with a countdown when there is a deadline). If the deadline passes it is withdrawn, the
   * `whenUnanswered` answer is taken and a note says so; with a deadline of 0 it is never posted.
   * An `autoSubmitAt` on the question itself caps the deadline.
   */
  async askQuestion<T extends QuestionInput>(
    question: T,
    { whenUnanswered, unansweredNote, onUnanswered, isApproval }: AskQuestionOptions<ResultTypeForQuestion<T["question"]>> = {},
  ): Promise<ResultTypeForQuestion<T["question"]> | null> {
    type Result = ResultTypeForQuestion<T["question"]> | null;
    const fallback = (whenUnanswered === undefined ? questionDefault(question.question) : whenUnanswered) as Result;
    const note = unansweredNote ?? (fallback === null ? "went on without an answer" : "used the default answer");
    const timeoutSeconds = this.getAnswerTimeoutSeconds();

    const noteInJob = (reason: "deadline" | "nobody") => {
      onUnanswered?.();
      if (isApproval) return;
      try {
        this.getService(AgentJobService)?.recordUnanswered(this, {
          question: questionSummary(question),
          answer: describeAnswer(fallback),
          reason,
          at: Date.now(),
        });
      } catch {
        // Recording is best-effort; the question already took its default.
      }
    };

    if (timeoutSeconds === 0) {
      this.infoMessage(`Nobody can answer here — ${note}: ${questionSummary(question)}`);
      noteInJob("nobody");
      return fallback;
    }

    const deadlines = [question.autoSubmitAt, timeoutSeconds === null ? undefined : Date.now() + timeoutSeconds * 1000].filter(
      (at): at is number => at !== undefined,
    );
    const autoSubmitAt = deadlines.length > 0 ? Math.min(...deadlines) : undefined;
    const startedAt = Date.now();
    const result = await this.postInteraction({ type: "question", ...question, ...(autoSubmitAt !== undefined && { autoSubmitAt }) });
    if (result === UNANSWERED) {
      this.warningMessage(`No answer within ${formatDurationMs(Date.now() - startedAt)} — ${note}: ${questionSummary(question)}`);
      noteInJob("deadline");
      return fallback;
    }
    return (result ?? null) as Result;
  }

  /**
   * Posts an interaction and waits for the response. A question with `autoSubmitAt` resolves to the
   * question's default value at that time. Prefer {@link askQuestion}, which applies the agent's deadline.
   */
  async waitForInteraction(interaction: Omit<z.input<typeof InteractionSchema>, "requestId" | "timestamp" | "interactionId">): Promise<unknown> {
    const result = await this.postInteraction(interaction);
    if (result !== UNANSWERED) return result;
    if (interaction.type !== "question") return undefined;
    return getDefaultQuestionValue(QuestionSchema.parse((interaction as unknown as { question: unknown }).question));
  }

  /** Posts an interaction and waits for its response, or {@link UNANSWERED} once its `autoSubmitAt` passes. */
  private async postInteraction(interaction: Omit<z.input<typeof InteractionSchema>, "requestId" | "timestamp" | "interactionId">): Promise<unknown> {
    const requestId = uuid();
    const interactionId = uuid();
    const event = InteractionSchema.parse({
      ...interaction,
      requestId,
      interactionId,
      timestamp: Date.now(),
    } as z.input<typeof InteractionSchema>);

    let removeAbortListener = () => {};
    const resultPromise = new Promise((resolve, reject) => {
      this.mutateState(AgentEventState, state => {
        if (state.currentlyExecutingInputItem) {
          const inputItem = state.currentlyExecutingInputItem;
          const signal = inputItem.abortController.signal;
          // An abort listener added to an already-aborted signal never fires: settle now, or this waits forever.
          if (signal.aborted) {
            reject(abortError(signal.reason));
            return;
          }
          const availableInteractions = inputItem.executionState.availableInteractions;
          availableInteractions.push(event);

          inputItem.interactionCallbacks.set(interactionId, resolve);
          state.pushInputExecution(inputItem);

          const onAbort = () => reject(abortError(signal.reason));
          signal.addEventListener("abort", onAbort, { once: true });
          removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        } else {
          throw new Error("Cannot initiate and interaction with the user when no currently executing input item is available");
        }
      });
    });

    try {
      if ("autoSubmitAt" in event && event.autoSubmitAt) {
        const delayMs = Math.max(0, event.autoSubmitAt - Date.now());

        const timer = new AbortController();
        try {
          return await Promise.race([resultPromise, delay(delayMs, UNANSWERED, { signal: timer.signal })]);
        } finally {
          // Answered first: don't keep a timer (and the process) alive until the auto-submit time.
          timer.abort();
        }
      }

      return await resultPromise;
    } finally {
      removeAbortListener();
      this.mutateState(AgentEventState, state => {
        const inputItem = state.currentlyExecutingInputItem;
        if (!inputItem) return;

        inputItem.interactionCallbacks.delete(interactionId);
        const previousLength = inputItem.executionState.availableInteractions.length;
        inputItem.executionState.availableInteractions = inputItem.executionState.availableInteractions.filter(
          availableInteraction => availableInteraction.interactionId !== interactionId,
        );

        if (inputItem.executionState.availableInteractions.length !== previousLength) {
          state.pushInputExecution(inputItem);
        }
      });
    }
  }

  async busyWithActivity<T>(message: string, awaitable: Promise<T> | (() => Promise<T>)): Promise<T> {
    const currentItem = this.getState(AgentEventState).currentlyExecutingInputItem;
    if (!currentItem) {
      // Checked before a promise is started, so a rejected one is never left unhandled.
      if (typeof awaitable !== "function") void awaitable.catch(() => {});
      throw new Error("busyWithActivity was called outside of a currently executing task in the Agent event loop, which is not allowed.");
    }
    if (typeof awaitable === "function") awaitable = awaitable();

    const prevActivity = currentItem.executionState.currentActivity;
    this.mutateState(AgentEventState, state => {
      currentItem.executionState.currentActivity = message;
      state.pushInputExecution(currentItem);
    });

    try {
      return await awaitable;
    } finally {
      // The turn may have ended (or been cancelled) while this ran: then there is no activity to restore,
      // and the work's own result or error is what the caller should see.
      this.mutateState(AgentEventState, state => {
        if (state.currentlyExecutingInputItem === currentItem) {
          currentItem.executionState.currentActivity = prevActivity;
          state.pushInputExecution(currentItem);
        }
      });
    }
  }

  setCurrentActivity(message: string) {
    this.mutateState(AgentEventState, state => {
      if (state.currentlyExecutingInputItem) {
        state.currentlyExecutingInputItem.executionState.currentActivity = message;
        state.pushInputExecution(state.currentlyExecutingInputItem);
      } else {
        throw new Error("setBusyWith was called outside of a currently executing task in the Agent event loop, which is not allowed.");
      }
    });
  }

  infoMessage = (...messages: string[]) =>
    this.emit({
      type: "output.info",
      message: formatLogMessages(...messages),
      timestamp: Date.now(),
    });

  warningMessage = (...messages: Arrayable<unknown>[]) =>
    this.emit({
      type: "output.warning",
      message: formatLogMessages(...messages),
      timestamp: Date.now(),
    });

  errorMessage = (...messages: Arrayable<unknown>[]) =>
    this.emit({
      type: "output.error",
      message: formatLogMessages(...messages),
      timestamp: Date.now(),
    });

  debugMessage = (...messages: Arrayable<unknown>[]) => {
    if (this.debugEnabled) {
      this.emit({
        type: "output.info",
        message: formatLogMessages(...messages),
        timestamp: Date.now(),
      });
    }
  };

  toolCallResult(result: Omit<ToolCallResult, "type" | "timestamp">) {
    this.emit(
      ToolCallResultSchema.parse({
        type: "toolCall",
        ...result,
        timestamp: Date.now(),
      }),
    );
  }

  /**
   * Answers a pending question. False (and nothing happens) when it is no longer pending: already
   * answered, cancelled, or auto-submitted — a double click or a late answer is not an error.
   */
  sendInteractionResponse = (response: Omit<InteractionResponse, "type" | "timestamp">): boolean => {
    const state = this.getState(AgentEventState);
    const item = state.inputQueue.find(candidate => candidate.request.requestId === response.requestId);
    if (!item?.interactionCallbacks.has(response.interactionId)) return false;
    this.emit({
      type: "input.interaction",
      ...response,
      timestamp: Date.now(),
    });
    return true;
  };

  /**
   * The signal that cancels what the agent is doing: the current input's, or, when no input is
   * running (a background watcher, an RPC call on an idle agent), the agent's shutdown signal.
   */
  getAbortSignal(): AbortSignal {
    return this.getState(AgentEventState).currentlyExecutingInputItem?.abortController.signal ?? this.agentShutdownSignal;
  }

  runBackgroundTask(task: (signal: AbortSignal) => Promise<void>) {
    Promise.resolve()
      .then(() => task(this.agentShutdownSignal))
      .catch(error => {
        console.log(error);
        this.errorMessage("Error while running background task", error as Error);
      });
  }

  private emit(event: AgentEventEnvelope): void {
    this.mutateState(AgentEventState, state => state.emit(event));
  }
}
