import fs from "node:fs";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { generateHumanId } from "@tokenring-ai/utility/string/generateHumanId";
import type Agent from "../Agent.ts";
import type { AgentEventEnvelope, InputMessage } from "../AgentEvents.ts";
import {
  AgentJobsConfigSchema,
  type JobRecord,
  JobRecordSchema,
  type JobRefusal,
  type JobStatus,
  type JobUnanswered,
  MAX_JOB_REFUSALS,
  MAX_JOB_UNANSWERED,
  type ParsedAgentJobsConfig,
} from "../schema.ts";
import { AgentEventState } from "../state/agentEventState.ts";
import AgentManager from "./AgentManager.ts";

/** Who started a job. */
export type JobOrigin =
  /** An agent's tool or command started it. */
  | { kind: "agent"; agent: Agent }
  /** The UI or an RPC call. */
  | { kind: "person"; label: string }
  /** A schedule fired. */
  | { kind: "schedule"; scheduleId: string };

export type JobSpec = {
  /** The plugin that owns the job: "queue", "tasks", "workflow", "scheduler", … */
  owner: string;
  /** Shown in lists: "ENG-12 · review", "docs queue #41". */
  label: string;
  /**
   * Where the owner keeps the entry this job runs, so the jobs view can link to it — queue
   * `{ queue }`, tasks `{ board, task }`, workflow `{ run }`, scheduler `{ schedule }`.
   */
  ownerRef?: Record<string, string> | undefined;
  agentType: string;
  origin: JobOrigin;
  /**
   * The job this one belongs under, when that is not the origin agent's job — e.g. a background run
   * group that outlives the agent that started it. Overrides the parent found from `origin`.
   */
  parentJobId?: string | undefined;
  /** `maxCostUsd` falls back to `agent.jobs.defaultMaxCostUsd` (no limit when neither is set). */
  limits?: { timeoutSeconds?: number | undefined; maxCostUsd?: number | undefined } | undefined;
  /**
   * The highest approval level this job may auto-approve; default `agent.jobs.maxAutoApprovalLevel`.
   * Always capped at `agent.jobs.approvalCeiling` (at most 7), the starter's own policy and the agent type's.
   */
  maxApprovalLevel?: number | undefined;
  /** "delete" (default): the agent is deleted when the job succeeds, an hour after it fails or is cancelled. "keep": left running. */
  cleanup?: "delete" | "keep" | undefined;
  /** Tools enabled on the job agent before its first input. */
  enableTools?: string[] | undefined;
  /** Every event of the job agent while a {@link JobSession.run} is waiting. */
  onEvent?: ((event: AgentEventEnvelope) => void) | undefined;
};

export type StartOptions = {
  /** Wait for a free slot instead of failing when `maxConcurrent` jobs are running. */
  wait?: boolean | undefined;
  /** Aborting it cancels the job: while it waits for a slot or while it runs. */
  signal?: AbortSignal | undefined;
};

/**
 * Why the engine ended a job early: cancelled (by its owner's signal, `cancel()` or a parent job),
 * over its time limit or budget, the app stopping, or the job's agent being stopped.
 */
export type JobEndKind = "cancelled" | "timeout" | "budget" | "shutdown" | "agentStopped";

/** The outcome of one input: the agent's `agent.response` plus the chat output it wrote meanwhile. */
export type StepResult = {
  status: "success" | "error" | "cancelled";
  /** The response message (for errors and cancellations, the reason). */
  message: string;
  /** Chat output written while the input ran. */
  output: string;
  /** Null when the input was never sent. */
  requestId: string | null;
  /**
   * Set when the engine ended the job (so the step was cut short or never sent): why. Absent when the
   * agent itself answered, errored or cancelled, or only this input's own signal fired.
   */
  ended?: JobEndKind | undefined;
};

export type RunOptions = {
  /** Cancels only this input (the job carries on). */
  signal?: AbortSignal | undefined;
};

export type RunInAgentOptions = {
  signal?: AbortSignal | undefined;
  /** 0 or absent: no limit. */
  timeoutSeconds?: number | undefined;
  onEvent?: ((event: AgentEventEnvelope) => void) | undefined;
};

export type JobListFilter = {
  owner?: string | undefined;
  status?: JobStatus[] | undefined;
  rootJobId?: string | undefined;
  /** Newest first; default all. */
  limit?: number | undefined;
};

export interface JobSession {
  readonly id: string;
  readonly agent: Agent;
  /** Fires on cancel, timeout, budget, the job agent being stopped, and app shutdown. */
  readonly signal: AbortSignal;
  /** Why the engine ended the job early; null while it runs, or when its owner finished it. */
  readonly ended: JobEndKind | null;
  /** The job's record as it is now. */
  readonly record: JobRecord;
  /**
   * Sends one input and waits for its `agent.response`. Never throws for an agent failure: see
   * {@link StepResult}. On a job that has already ended it sends nothing and returns `cancelled`
   * with the reason (and `ended` when the engine ended it).
   */
  run(input: InputMessage, opts?: RunOptions): Promise<StepResult>;
  /**
   * Ends the job. When the job was already ended by a cancel, timeout, budget or shutdown, that
   * status stands and `status` is ignored. Calling it again returns the record unchanged.
   */
  finish(status: "succeeded" | "failed" | "cancelled", summary?: string): Promise<JobRecord>;
}

/** Approval settings, as the chat plugin keeps them. */
export type JobApprovalPolicy = { autoToolApprovalLevel: number; toolApprovalMode: string };

/**
 * What the engine needs from the chat plugin, which registers it (the agent plugin cannot depend on chat).
 * Without one, jobs run with their agent type's own settings and `enableTools` is ignored.
 */
export interface JobChatIntegration {
  /** The policy that decides `agent`'s approvals now (for a sub-agent, its chat's). */
  approvalPolicyOf(agent: Agent): JobApprovalPolicy;
  /** The policy a new agent gets by default (`chat.agentDefaults`). */
  defaultApprovalPolicy(): JobApprovalPolicy;
  /** Writes the policy into the agent's own chat settings. */
  setApprovalPolicy(agent: Agent, policy: JobApprovalPolicy): void;
  enableTools(agent: Agent, tools: string[]): void;
}

/** Reads what an agent has spent so far; registered by the metrics plugin. */
export type JobUsageReader = (agent: Agent) => { costUsd: number; tokens: number } | null;

/** Whether an escalation target is set (a person can be asked about unattended questions at all); registered by the bot plugin. */
export type EscalationConfigured = () => boolean;

/** What an unattended job is allowed, as the operator configured it. */
export type JobPolicy = {
  /** The approval level an unattended job auto-approves up to unless it asks for more (capped at the ceiling). */
  defaultApprovalLevel: number;
  approvalCeiling: number;
  defaultMaxCostUsd: number | null;
  escalationConfigured: boolean;
};

/** Whether a person can be reached for a waiting question from an agent of this type; registered by the bot plugin. */
export type HumanReachable = (agentType: string) => boolean;

export type LimitName = "maxDepth" | "maxConcurrent" | "maxDescendants";

/** A job was refused because a limit in `agent.jobs` says no. */
export class LimitError extends Error {
  override readonly name = "LimitError";
  constructor(
    readonly limit: LimitName,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A job started with {@link AgentJobService.startJobWhenFree}: its id is known at once (null when it was
 * refused before a record was made), its session once a slot is free.
 */
export type PendingJob = {
  id: string | null;
  /** Rejects with LimitError, JobCancelledError, or the error that kept the agent from starting. */
  session: Promise<JobSession>;
};

/** A job waiting for a slot was cancelled before it started. */
export class JobCancelledError extends Error {
  override readonly name = "JobCancelledError";
}

class JobAbort extends Error {
  override readonly name = "JobAbort";
  constructor(
    readonly kind: JobEndKind,
    message: string,
  ) {
    super(message);
  }
}

/** Why the engine ended the job whose signal this is; null when it has not. */
function endKindOf(signal: AbortSignal): JobEndKind | null {
  return signal.aborted && signal.reason instanceof JobAbort ? signal.reason.kind : null;
}

/** How long a failed or cancelled job's agent is kept for inspection. */
export const KEEP_FAILED_AGENT_MS = 60 * 60_000;
/** Records kept in memory and on disk. */
export const MAX_JOB_RECORDS = 1000;
const MAX_SUMMARY_LENGTH = 4000;
const RECORDS_FILE_VERSION = 1;

const ACTIVE: ReadonlySet<JobStatus> = new Set(["queued", "running"]);

type ActiveJob = {
  spec: JobSpec;
  controller: AbortController;
  agent: Agent | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** Settles a start() that is waiting for a slot. */
  waiter: { resolve: (session: JobSession) => void; reject: (error: Error) => void } | null;
  removeExternalAbort: () => void;
  /** Checks the spend while a long step runs, when the job has a budget. */
  budgetTimer: ReturnType<typeof setInterval> | null;
  /** The approval level the job's policy is capped at. */
  approvalCap: number;
};

/** How often a running job's spend is checked against its budget between steps. */
export const BUDGET_CHECK_MS = 10_000;

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? `${text.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : text;
}

function firstLine(text: string, max = 300): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function reasonText(signal: AbortSignal, fallback: string): string {
  const reason: unknown = signal.reason;
  if (typeof reason === "string" && reason) return reason;
  // Errors and DOMExceptions (AbortSignal.timeout) alike.
  if (typeof reason === "object" && reason !== null && "message" in reason && typeof reason.message === "string" && reason.message) return reason.message;
  return fallback;
}

function isTimeout(signal: AbortSignal): boolean {
  const reason: unknown = signal.reason;
  return typeof reason === "object" && reason !== null && "name" in reason && reason.name === "TimeoutError";
}

/**
 * Cancels one input of `agent` and nothing else: dropped while queued (or still being prepared),
 * aborted only when it is the one running.
 */
function cancelOwnInput(agent: Agent, requestId: string, reason: string): void {
  const state = agent.getState(AgentEventState);
  if (state.currentlyExecutingInputItem?.request.requestId === requestId) {
    agent.abortCurrentOperation(reason);
  } else {
    agent.cancelInput(requestId, reason);
  }
}

/**
 * Sends `input` to `agent` and waits for the matching `agent.response`.
 *
 * With `waitForIdle`, it first waits for the agent to finish what it is doing (a job agent's initial
 * commands). `waitForState` resolves at once for an idle agent even when the signal has fired, so
 * the signal is checked again after it.
 */
async function runInput(
  agent: Agent,
  input: InputMessage,
  signal: AbortSignal,
  { waitForIdle, onEvent }: { waitForIdle: boolean; onEvent?: ((event: AgentEventEnvelope) => void) | undefined },
): Promise<StepResult> {
  const cancelled = (requestId: string | null): StepResult => ({
    status: "cancelled",
    message: reasonText(signal, agent.agentShutdownSignal.aborted ? "The agent was stopped" : "Cancelled"),
    output: "",
    requestId,
  });
  if (signal.aborted) return cancelled(null);
  if (agent.agentShutdownSignal.aborted) return { status: "cancelled", message: "The agent was stopped", output: "", requestId: null };

  if (waitForIdle) {
    // A function, so each check re-reads the signals after an await.
    const ended = () => signal.aborted || agent.agentShutdownSignal.aborted;
    // Inputs sent just before (initial commands) are not in the queue until their hooks have run.
    await agent.inputsPrepared();
    try {
      await agent.waitForState(AgentEventState, state => state.idle, AbortSignal.any([signal, agent.agentShutdownSignal]));
    } catch (error) {
      if (ended()) return cancelled(null);
      throw error;
    }
    // waitForState resolves at once for an idle agent even when the signal has fired.
    if (ended()) return cancelled(null);
  }

  const cursor = agent.getState(AgentEventState).getEventCursorFromCurrentPosition();
  const requestId = agent.handleInput(input);

  const onAbort = () => cancelOwnInput(agent, requestId, reasonText(signal, "Cancelled"));
  signal.addEventListener("abort", onAbort, { once: true });

  const output: string[] = [];
  try {
    for await (const state of agent.subscribeStateAsync(AgentEventState, AbortSignal.any([signal, agent.agentShutdownSignal]))) {
      for (const event of state.yieldEventsByCursor(cursor)) {
        if (onEvent) {
          try {
            onEvent(event);
          } catch (error) {
            console.error("A job's onEvent handler failed:", error);
          }
        }
        if (event.type === "output.chat") output.push(event.message);
        else if (event.type === "agent.response" && event.requestId === requestId) {
          return { status: event.status, message: event.message, output: output.join(""), requestId };
        } else if (event.type === "agent.stopped") {
          return { status: "cancelled", message: `The agent was stopped: ${event.message}`, output: output.join(""), requestId };
        }
      }
    }
    return { ...cancelled(requestId), output: output.join("") };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Runs agents unattended — queue items, task dispatches, workflow runs, scheduled prompts — the one
 * way: spawning, sending, waiting, cancelling, time and cost limits, cleanup and lineage, with one
 * persisted {@link JobRecord} per job.
 *
 * **Lineage.** A job started from an agent (or anything under a job agent) is that job's child: the
 * agent is spawned as a sub-agent of the origin agent, and its depth is the parent job's + 1. Depth,
 * fan-out (`maxDescendants` per top-level tree) and concurrency are limited by `agent.jobs`.
 *
 * **Approvals.** At start the starter's effective approval policy (an agent's, or `chat.agentDefaults`
 * for a person or schedule) is snapshotted, capped at `maxAutoApprovalLevel`, and written into the job
 * agent's own chat settings. The job agent's policy is then *pinned*: it no longer follows a live
 * parent, and its own sub-agents follow it rather than the chat above it.
 *
 * **Needing a person.** When the bot plugin reports that a person can be reached (`escalation.target`
 * is set and covers the agent type), a job agent's questions wait for an answer up to the job's time
 * limit (its `answerTimeoutSeconds`): a question or approval shows in the app and is escalated over
 * chat, and unanswered it takes its default (approvals are refused). Otherwise the deadline is 0, so
 * anything that needs a person is refused (or takes its default) at once. Like the approval policy,
 * the deadline is set on the job agent itself, so it never follows a parent.
 *
 * **Restarts.** Records are saved to `agent-jobs.json` in the workspace. A job that was running when
 * the app stopped or crashed is `interrupted` and never re-run automatically.
 */
export default class AgentJobService implements TokenRingService {
  readonly name = "AgentJobService";
  description = "Runs agents unattended, with lineage, limits, time limits and a record of every job.";

  private config: ParsedAgentJobsConfig = AgentJobsConfigSchema.parse({});
  private readonly records = new Map<string, JobRecord>();
  private readonly active = new Map<string, ActiveJob>();
  /** Live job agents → their job. */
  private readonly agentJobs = new Map<string, string>();
  /** Jobs started per top-level tree (the root itself not counted). */
  private readonly treeCounts = new Map<string, number>();
  /** Waiting start() calls, in arrival order. */
  private readonly waiting: string[] = [];
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly changeListeners = new Set<(record: JobRecord) => void>();
  private readonly finishListeners = new Set<(record: JobRecord) => void>();

  private chat: JobChatIntegration | null = null;
  private usageReader: JobUsageReader | null = null;
  private humanReachable: HumanReachable | null = null;
  private escalationConfigured: EscalationConfigured | null = null;

  private readonly recordsFile: string;
  private readonly keepFailedAgentMs: number;
  private writeChain: Promise<void> = Promise.resolve();
  private writeQueued = false;
  private tmpCounter = 0;
  private stopped = false;

  constructor(
    private readonly app: TokenRingApp,
    options: { recordsFile?: string | undefined; config?: ParsedAgentJobsConfig | undefined; keepFailedAgentMs?: number | undefined } = {},
  ) {
    this.recordsFile = options.recordsFile ?? app.getWorkspaceResolvedPath("agent-jobs.json");
    this.keepFailedAgentMs = options.keepFailedAgentMs ?? KEEP_FAILED_AGENT_MS;
    if (options.config) this.config = options.config;
  }

  reconfigure(config: ParsedAgentJobsConfig): void {
    this.config = config;
  }

  getConfig(): ParsedAgentJobsConfig {
    return this.config;
  }

  // ─── Hooks registered by other plugins ─────────────────────────────────────

  setChatIntegration(integration: JobChatIntegration | null): () => void {
    this.chat = integration;
    return () => {
      if (this.chat === integration) this.chat = null;
    };
  }

  setUsageReader(reader: JobUsageReader | null): () => void {
    this.usageReader = reader;
    return () => {
      if (this.usageReader === reader) this.usageReader = null;
    };
  }

  /** The bot plugin registers this when approval escalation is configured. */
  setHumanReachable(check: HumanReachable | null): () => void {
    this.humanReachable = check;
    return () => {
      if (this.humanReachable === check) this.humanReachable = null;
    };
  }

  /** The bot plugin registers this: whether an approval escalation target is set. */
  setEscalationConfigured(check: EscalationConfigured | null): () => void {
    this.escalationConfigured = check;
    return () => {
      if (this.escalationConfigured === check) this.escalationConfigured = null;
    };
  }

  /** The operator's limits for unattended jobs, for forms that let a person choose per-schedule or per-queue values. */
  getJobPolicy(): JobPolicy {
    let escalationConfigured = false;
    try {
      escalationConfigured = this.escalationConfigured?.() ?? false;
    } catch {
      // Treated as not configured.
    }
    return {
      defaultApprovalLevel: Math.min(this.config.maxAutoApprovalLevel, this.config.approvalCeiling),
      approvalCeiling: this.config.approvalCeiling,
      defaultMaxCostUsd: this.config.defaultMaxCostUsd ?? null,
      escalationConfigured,
    };
  }

  /** Throws a clear error when `level` is above `agent.jobs.approvalCeiling`. Undefined passes. */
  assertApprovalLevel(level: number | undefined): void {
    if (level !== undefined && level > this.config.approvalCeiling) {
      throw new Error(
        `Approval level ${level} is above this installation's ceiling of ${this.config.approvalCeiling} (agent.jobs.approvalCeiling); choose ${this.config.approvalCeiling} or lower. Levels 8 and above always need a person and are refused in unattended runs.`,
      );
    }
  }

  /**
   * Notes that the approval policy refused an action in the job `agent` works for (an unattended agent
   * that cannot ask, or was not answered). The first {@link MAX_JOB_REFUSALS} are listed on the record;
   * all are counted.
   */
  recordRefusal(agent: Agent, refusal: JobRefusal): void {
    const jobId = this.jobOfAgentTree(agent);
    const record = jobId ? this.records.get(jobId) : undefined;
    if (!jobId || !record) return;
    this.updateRecord(jobId, {
      refusalCount: record.refusalCount + 1,
      refusals: record.refusals.length < MAX_JOB_REFUSALS ? [...record.refusals, { ...refusal, message: firstLine(refusal.message) }] : record.refusals,
    });
  }

  /**
   * Notes that a question (not an approval) nobody answered took its default in the job `agent` works
   * for, so someone reviewing the job can see what an unattended agent chose. The first
   * {@link MAX_JOB_UNANSWERED} are listed on the record; all are counted.
   */
  recordUnanswered(agent: Agent, entry: JobUnanswered): void {
    const jobId = this.jobOfAgentTree(agent);
    const record = jobId ? this.records.get(jobId) : undefined;
    if (!jobId || !record) return;
    this.updateRecord(jobId, {
      unansweredCount: record.unansweredCount + 1,
      unanswered:
        record.unanswered.length < MAX_JOB_UNANSWERED
          ? [...record.unanswered, { ...entry, question: firstLine(entry.question, 200), answer: firstLine(entry.answer, 200) }]
          : record.unanswered,
    });
  }

  /** Whether a person can be reached to answer a job agent of this type (else its questions take their defaults at once). */
  canReachHuman(agentType: string): boolean {
    try {
      return this.humanReachable?.(agentType) ?? false;
    } catch {
      return false;
    }
  }

  // ─── Service lifecycle ─────────────────────────────────────────────────────

  stop(): void {
    this.stopped = true;
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
    // Deleting entries while iterating a Map is safe: removed ones are skipped.
    for (const jobId of this.active.keys()) {
      this.abortJob(jobId, new JobAbort("shutdown", "The app stopped while the job was running"));
    }
    this.writeNow();
  }

  /** Forgets a deleted job agent; a job still running on it is cancelled. */
  detach(agent: Agent): void {
    const jobId = this.agentJobs.get(agent.id);
    if (!jobId) return;
    this.agentJobs.delete(agent.id);
    const timer = this.cleanupTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(jobId);
    }
    if (this.active.has(jobId)) this.abortJob(jobId, new JobAbort("agentStopped", "The job's agent was stopped"));
  }

  // ─── Starting jobs ─────────────────────────────────────────────────────────

  /**
   * Starts a job (the design's `start`; named so because the app calls a service's `start(signal)`
   * at boot): checks the limits, spawns its agent, snapshots the approval policy.
   * Throws {@link LimitError} when a limit says no. With `{ wait: true }` it returns a promise that
   * waits for a free slot instead of failing on `maxConcurrent`; every refusal (depth, fan-out, the
   * app stopping) then rejects it, and it rejects with {@link JobCancelledError} when cancelled while
   * waiting. Use {@link startJobWhenFree} to learn the job's id while it waits.
   */
  startJob(spec: JobSpec): JobSession;
  startJob(spec: JobSpec, opts: StartOptions & { wait: true }): Promise<JobSession>;
  startJob(spec: JobSpec, opts?: StartOptions): JobSession;
  startJob(spec: JobSpec, opts: StartOptions = {}): JobSession | Promise<JobSession> {
    if (opts.wait) return this.startJobWhenFree(spec, opts).session;
    const started = this.begin(spec, opts, false);
    return this.launch(started.id);
  }

  /**
   * Starts a job that waits for a free slot when `maxConcurrent` jobs are running. The id is known at
   * once (the record is `queued` while it waits), so an owner can link to it before it starts. Never
   * throws: every refusal rejects `session`.
   */
  startJobWhenFree(spec: JobSpec, opts: Omit<StartOptions, "wait"> = {}): PendingJob {
    let started: { id: string; slotFree: boolean };
    try {
      started = this.begin(spec, opts, true);
    } catch (error) {
      return { id: null, session: Promise.reject(Error.isError(error) ? error : new Error(String(error))) };
    }
    const { id, slotFree } = started;
    if (slotFree) {
      try {
        return { id, session: Promise.resolve(this.launch(id)) };
      } catch (error) {
        return { id, session: Promise.reject(Error.isError(error) ? error : new Error(String(error))) };
      }
    }
    const job = this.active.get(id)!;
    this.waiting.push(id);
    return {
      id,
      session: new Promise<JobSession>((resolve, reject) => {
        job.waiter = { resolve, reject };
      }),
    };
  }

  /** Checks the limits and records the job (queued). Throws when it is refused. */
  private begin(spec: JobSpec, opts: StartOptions, wait: boolean): { id: string; slotFree: boolean } {
    if (this.stopped) throw new Error("The app is stopping; no new jobs can start");
    if (opts.signal?.aborted) throw new JobCancelledError(reasonText(opts.signal, "Cancelled before it started"));

    const { parentJobId, depth, rootJobId } = this.placeInTree(spec);
    if (depth > this.config.maxDepth) {
      throw new LimitError(
        "maxDepth",
        `Job "${spec.label}" would be ${depth} levels deep; jobs may nest at most ${this.config.maxDepth} deep (agent.jobs.maxDepth).`,
      );
    }
    if (rootJobId !== null && (this.treeCounts.get(rootJobId) ?? 0) >= this.config.maxDescendants) {
      throw new LimitError(
        "maxDescendants",
        `Job "${spec.label}" was refused: its top-level job has already started ${this.config.maxDescendants} jobs (agent.jobs.maxDescendants).`,
      );
    }
    const slotFree = this.runningCount() < this.config.maxConcurrent && this.waiting.length === 0;
    if (!slotFree && !wait) {
      throw new LimitError(
        "maxConcurrent",
        `Job "${spec.label}" was refused: ${this.config.maxConcurrent} jobs are already running (agent.jobs.maxConcurrent). Try again when one finishes.`,
      );
    }

    const approvalCap = Math.min(spec.maxApprovalLevel ?? this.config.maxAutoApprovalLevel, this.config.approvalCeiling);
    const id = generateHumanId();
    const now = Date.now();
    const record: JobRecord = {
      id,
      owner: spec.owner,
      label: spec.label,
      ownerRef: { ...spec.ownerRef },
      agentType: spec.agentType,
      origin:
        spec.origin.kind === "agent"
          ? { kind: "agent", agentId: spec.origin.agent.id, agentType: spec.origin.agent.config.agentType }
          : spec.origin.kind === "person"
            ? { kind: "person", label: spec.origin.label }
            : { kind: "schedule", scheduleId: spec.origin.scheduleId },
      parentJobId,
      rootJobId: rootJobId ?? id,
      depth,
      status: "queued",
      requestedAt: now,
      startedAt: null,
      endedAt: null,
      summary: "",
      error: null,
      costUsd: null,
      tokens: null,
      agentId: null,
      maxCostUsd: spec.limits?.maxCostUsd ?? this.config.defaultMaxCostUsd ?? null,
      approvalLevel: approvalCap,
      refusals: [],
      refusalCount: 0,
      unanswered: [],
      unansweredCount: 0,
    };
    if (rootJobId !== null) this.treeCounts.set(rootJobId, (this.treeCounts.get(rootJobId) ?? 0) + 1);

    const job: ActiveJob = {
      spec,
      controller: new AbortController(),
      agent: null,
      timer: null,
      waiter: null,
      removeExternalAbort: () => {},
      budgetTimer: null,
      approvalCap,
    };
    this.active.set(id, job);
    this.addRecord(record);

    if (opts.signal) {
      const external = opts.signal;
      const onExternalAbort = () => this.cancel(id, reasonText(external, "Cancelled"));
      external.addEventListener("abort", onExternalAbort, { once: true });
      job.removeExternalAbort = () => external.removeEventListener("abort", onExternalAbort);
    }
    return { id, slotFree };
  }

  /** Starts a job, sends it one input, and finishes it with the outcome. */
  async runOnce(spec: JobSpec, input: InputMessage, opts: StartOptions = {}): Promise<JobRecord> {
    const session = opts.wait ? await this.startJob(spec, { ...opts, wait: true }) : this.startJob(spec, opts);
    let result: StepResult;
    try {
      result = await session.run(input);
    } catch (error) {
      return await session.finish("failed", Error.isError(error) ? error.message : String(error));
    }
    if (result.status === "success") return await session.finish("succeeded", result.output || result.message);
    return await session.finish(result.status === "cancelled" ? "cancelled" : "failed", result.message);
  }

  /**
   * Runs an input in an existing agent (one that is not a job's) and waits for it — the scheduler's
   * "prompt this chat". The input queues behind whatever the agent is doing. On abort or timeout only
   * this input is cancelled: dropped while queued, aborted only while it is the one running.
   */
  async runInAgent(agent: Agent, input: InputMessage, opts: RunInAgentOptions = {}): Promise<StepResult> {
    const signals: AbortSignal[] = [];
    if (opts.signal) signals.push(opts.signal);
    if (opts.timeoutSeconds && opts.timeoutSeconds > 0) signals.push(AbortSignal.timeout(opts.timeoutSeconds * 1000));
    const signal = signals.length > 0 ? AbortSignal.any(signals) : new AbortController().signal;
    const result = await runInput(agent, input, signal, { waitForIdle: false, onEvent: opts.onEvent });
    if (result.status === "cancelled" && isTimeout(signal)) {
      return { ...result, message: `Timed out after ${opts.timeoutSeconds} seconds` };
    }
    return result;
  }

  // ─── Cancelling and querying ───────────────────────────────────────────────

  /** Cancels a queued or running job and every job under it. False when it was not active. */
  cancel(jobId: string, reason: string): boolean {
    if (!this.active.has(jobId)) return false;
    this.abortJob(jobId, new JobAbort("cancelled", reason));
    return true;
  }

  get(jobId: string): JobRecord | undefined {
    const record = this.records.get(jobId);
    return record ? { ...record } : undefined;
  }

  list(filter: JobListFilter = {}): JobRecord[] {
    const statuses = filter.status ? new Set(filter.status) : null;
    const result: JobRecord[] = [];
    for (const record of [...this.records.values()].reverse()) {
      if (filter.owner !== undefined && record.owner !== filter.owner) continue;
      if (statuses && !statuses.has(record.status)) continue;
      if (filter.rootJobId !== undefined && record.rootJobId !== filter.rootJobId) continue;
      result.push({ ...record });
      if (filter.limit !== undefined && result.length >= filter.limit) break;
    }
    return result;
  }

  /** The job an agent is (or was) working for. */
  jobForAgent(agentId: string): JobRecord | undefined {
    const live = this.agentJobs.get(agentId);
    if (live) return this.get(live);
    for (const record of [...this.records.values()].reverse()) {
      if (record.agentId === agentId) return { ...record };
    }
    return undefined;
  }

  /**
   * True for a live job agent: its approval policy was snapshotted at start and must not follow its
   * parent. The chat plugin's `approvalPolicy` stops its walk up the parent chain here.
   */
  isPolicyPinned(agentId: string): boolean {
    return this.agentJobs.has(agentId);
  }

  /** Called on every change to a record. */
  subscribe(listener: (record: JobRecord) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Called once when a job reaches a final status. */
  onJobFinished(listener: (record: JobRecord) => void): () => void {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private runningCount(): number {
    let count = 0;
    for (const job of this.active.values()) if (job.agent) count++;
    return count;
  }

  /**
   * The job an agent works for: its own (while its agent exists), or the nearest ancestor agent's —
   * a plain sub-agent of a job agent counts as that job. Null for an agent outside any job.
   */
  jobOfAgentTree(agent: Agent): string | null {
    const agentManager = this.app.getService(AgentManager);
    let current: Agent | null = agent;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const jobId = this.agentJobs.get(current.id);
      if (jobId) return jobId;
      current = current.parentAgentId ? (agentManager?.getAgent(current.parentAgentId) ?? null) : null;
    }
    return null;
  }

  private placeInTree(spec: JobSpec): { parentJobId: string | null; depth: number; rootJobId: string | null } {
    let parentJobId: string | null = null;
    if (spec.parentJobId !== undefined) {
      if (!this.records.has(spec.parentJobId)) throw new Error(`Unknown parent job ${spec.parentJobId}`);
      parentJobId = spec.parentJobId;
    } else if (spec.origin.kind === "agent") {
      parentJobId = this.jobOfAgentTree(spec.origin.agent);
    }
    const parent = parentJobId ? this.records.get(parentJobId) : undefined;
    if (!parent) return { parentJobId: null, depth: 1, rootJobId: null };
    return { parentJobId: parent.id, depth: parent.depth + 1, rootJobId: parent.rootJobId };
  }

  /** Spawns the agent of a job that has a slot, and hands out its session. */
  private launch(jobId: string): JobSession {
    const job = this.active.get(jobId);
    const record = this.records.get(jobId);
    if (!job || !record) throw new JobCancelledError("The job was cancelled before it started");
    const { spec } = job;
    const agentManager = this.app.requireService(AgentManager);

    // Snapshot the starter's policy before anything changes.
    const originAgent = spec.origin.kind === "agent" && !spec.origin.agent.agentShutdownSignal.aborted ? spec.origin.agent : null;
    let starterPolicy: JobApprovalPolicy | null = null;
    let agent: Agent;
    try {
      if (this.chat) starterPolicy = this.starterPolicy(this.chat, originAgent);
      const timeoutSeconds = spec.limits?.timeoutSeconds ?? this.config.timeoutSeconds;
      // A person who can be reached gets the job's time (no limit: until answered); nobody to reach: answer at once.
      const answerTimeoutSeconds = this.canReachHuman(spec.agentType) ? (timeoutSeconds > 0 ? timeoutSeconds : null) : 0;
      // Always a top-level agent: a job outlives the agent that started it (a queue item keeps running when the
      // job that queued it succeeds, or its chat is closed). Lineage lives in the job tree instead, which is
      // what depth, fan-out and cancel cascades follow. The starter's working state (sandbox, providers, memory
      // context) still carries over, as it would for a sub-agent.
      agent = agentManager.spawnAgentFromConfig(
        {
          ...agentManager.requireAgentConfig(spec.agentType),
          ...(originAgent && { createMessage: `Job "${spec.label}" (${spec.owner}) started by agent ${originAgent.id}` }),
        },
        { answerTimeoutSeconds },
      );
      if (originAgent) {
        for (const slice of agent.stateManager.slices()) slice.transferStateFromParent(originAgent);
      }
    } catch (error) {
      this.finalize(jobId, "failed", { error: `Could not start the agent: ${Error.isError(error) ? error.message : String(error)}` });
      throw error;
    }

    job.agent = agent;
    this.agentJobs.set(agent.id, jobId);

    try {
      if (this.chat && starterPolicy) {
        const own = this.chat.approvalPolicyOf(agent);
        this.chat.setApprovalPolicy(agent, {
          autoToolApprovalLevel: Math.min(starterPolicy.autoToolApprovalLevel, own.autoToolApprovalLevel, job.approvalCap),
          toolApprovalMode: starterPolicy.toolApprovalMode,
        });
      }
      if (spec.enableTools && spec.enableTools.length > 0) this.chat?.enableTools(agent, spec.enableTools);
    } catch (error) {
      this.finalize(jobId, "failed", { error: `Could not set up the agent: ${Error.isError(error) ? error.message : String(error)}` });
      throw error;
    }

    const timeoutSeconds = spec.limits?.timeoutSeconds ?? this.config.timeoutSeconds;
    if (timeoutSeconds > 0) {
      job.timer = setTimeout(() => this.abortJob(jobId, new JobAbort("timeout", `Timed out after ${timeoutSeconds} seconds`)), timeoutSeconds * 1000);
    }

    if (record.maxCostUsd !== null) {
      job.budgetTimer = setInterval(() => this.recordUsage(jobId, agent), BUDGET_CHECK_MS);
      job.budgetTimer.unref();
    }

    this.updateRecord(jobId, { status: "running", startedAt: Date.now(), agentId: agent.id });
    return this.createSession(jobId, agent, job.controller.signal);
  }

  /** The starter's effective policy; the default for a person, a schedule, or an agent without chat settings. */
  private starterPolicy(chat: JobChatIntegration, originAgent: Agent | null): JobApprovalPolicy {
    if (originAgent) {
      try {
        return chat.approvalPolicyOf(originAgent);
      } catch {
        // Not a chat agent: it has no approval setting of its own.
      }
    }
    return chat.defaultApprovalPolicy();
  }

  private createSession(jobId: string, agent: Agent, signal: AbortSignal): JobSession {
    let lastRecord = this.get(jobId)!;
    // Kept even if the record is later rotated out of the store.
    const currentRecord = () => (lastRecord = this.get(jobId) ?? lastRecord);
    const run = async (input: InputMessage, opts: RunOptions = {}): Promise<StepResult> => {
      const job = this.active.get(jobId);
      if (!job) {
        const record = currentRecord();
        const ended = endKindOf(signal);
        return {
          status: "cancelled",
          message: `Job ${jobId} has already ended (${record.status})${record.error ? `: ${record.error}` : ""}`,
          output: "",
          requestId: null,
          ...(ended && { ended }),
        };
      }
      const runSignal = opts.signal ? AbortSignal.any([signal, opts.signal]) : signal;
      const result = await runInput(agent, input, runSignal, { waitForIdle: true, onEvent: job.spec.onEvent });
      this.recordUsage(jobId, agent);
      // The job's own signal (not just this input's) fired, or the budget check above ended it.
      const ended = endKindOf(signal);
      if (ended && result.status !== "success") return { ...result, ended };
      return result;
    };
    const finish = async (status: "succeeded" | "failed" | "cancelled", summary?: string): Promise<JobRecord> => {
      if (this.active.has(jobId)) {
        this.finalize(jobId, status, status === "succeeded" ? { summary: summary ?? "" } : { summary: summary ?? "", error: summary ?? status });
      } else if (summary && !this.records.get(jobId)?.summary) {
        // Ended by a cancel or limit first: keep that status, but take the owner's summary.
        this.updateRecord(jobId, { summary: truncate(summary) });
      }
      await this.flush();
      return currentRecord();
    };
    return {
      id: jobId,
      agent,
      signal,
      get ended() {
        return endKindOf(signal);
      },
      get record() {
        return currentRecord();
      },
      run,
      finish,
    };
  }

  /** Reads the job agent's spend; over budget aborts the job. */
  private recordUsage(jobId: string, agent: Agent): void {
    if (!this.usageReader || !this.records.has(jobId)) return;
    let usage: { costUsd: number; tokens: number } | null;
    try {
      usage = this.usageReader(agent);
    } catch {
      return;
    }
    if (!usage) return;
    this.updateRecord(jobId, { costUsd: usage.costUsd, tokens: usage.tokens });
    const maxCostUsd = this.records.get(jobId)?.maxCostUsd;
    if (maxCostUsd != null && usage.costUsd > maxCostUsd && this.active.has(jobId)) {
      const message = `Stopped: over budget. Spent $${usage.costUsd.toFixed(2)}, over the job's limit of $${maxCostUsd.toFixed(2)}`;
      try {
        agent.warningMessage(message);
      } catch {
        // The agent is already gone; the record carries the reason.
      }
      this.abortJob(jobId, new JobAbort("budget", message));
    }
  }

  /** Ends an active job because of `abort`, and every active job under it. */
  private abortJob(jobId: string, abort: JobAbort): void {
    const job = this.active.get(jobId);
    if (!job) return;
    const status: JobStatus = abort.kind === "shutdown" ? "interrupted" : abort.kind === "timeout" || abort.kind === "budget" ? "failed" : "cancelled";
    const queued = !job.agent;
    this.finalize(jobId, status, { error: abort.message });
    job.controller.abort(abort);
    if (queued) job.waiter?.reject(new JobCancelledError(abort.message));

    for (const child of this.active.keys()) {
      if (this.records.get(child)?.parentJobId === jobId) {
        this.abortJob(child, abort.kind === "shutdown" ? abort : new JobAbort("cancelled", `Its parent job was stopped: ${abort.message}`));
      }
    }
  }

  /** Moves a job to a final status, frees its slot and schedules its agent's cleanup. */
  private finalize(jobId: string, status: JobStatus, { summary, error }: { summary?: string; error?: string }): void {
    const job = this.active.get(jobId);
    if (!job) return;
    this.active.delete(jobId);
    if (job.timer) clearTimeout(job.timer);
    if (job.budgetTimer) clearInterval(job.budgetTimer);
    job.removeExternalAbort();
    const waitingIndex = this.waiting.indexOf(jobId);
    if (waitingIndex !== -1) this.waiting.splice(waitingIndex, 1);

    if (job.agent) this.recordUsage(jobId, job.agent);
    this.updateRecord(jobId, {
      status,
      endedAt: Date.now(),
      ...(summary !== undefined && { summary: truncate(summary) }),
      ...(error !== undefined && { error: truncate(error) }),
    });
    const record = this.get(jobId);
    if (record) {
      for (const listener of this.finishListeners) {
        try {
          listener(record);
        } catch (listenerError) {
          console.error("An onJobFinished listener failed:", listenerError);
        }
      }
    }

    if (job.agent && status !== "interrupted") this.cleanUp(jobId, job.agent, status, job.spec.cleanup ?? "delete");
    this.pumpWaiting();
  }

  private cleanUp(jobId: string, agent: Agent, status: JobStatus, cleanup: "delete" | "keep"): void {
    if (cleanup === "keep" || agent.agentShutdownSignal.aborted) return;
    const agentManager = this.app.getService(AgentManager);
    if (!agentManager) return;
    if (status === "succeeded") {
      agentManager.deleteAgent(agent.id, `Job "${this.records.get(jobId)?.label ?? jobId}" finished`);
      return;
    }
    // Kept for an hour so the transcript can be read, then deleted.
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(jobId);
      agentManager.deleteAgent(agent.id, `Job "${this.records.get(jobId)?.label ?? jobId}" ${status} an hour ago`);
    }, this.keepFailedAgentMs);
    timer.unref();
    this.cleanupTimers.set(jobId, timer);
  }

  private pumpWaiting(): void {
    if (this.stopped) return;
    while (this.waiting.length > 0 && this.runningCount() < this.config.maxConcurrent) {
      const jobId = this.waiting.shift()!;
      const job = this.active.get(jobId);
      if (!job?.waiter) continue;
      const { waiter } = job;
      job.waiter = null;
      try {
        // launch() spawns synchronously, so the slot counts before the next waiter is considered.
        waiter.resolve(this.launch(jobId));
      } catch (error) {
        waiter.reject(Error.isError(error) ? error : new Error(String(error)));
      }
    }
  }

  // ─── Records and persistence ───────────────────────────────────────────────

  private addRecord(record: JobRecord): void {
    this.records.set(record.id, record);
    // Oldest finished records go first; active ones are never dropped.
    if (this.records.size > MAX_JOB_RECORDS) {
      for (const [id, candidate] of this.records) {
        if (this.records.size <= MAX_JOB_RECORDS) break;
        if (!ACTIVE.has(candidate.status)) this.records.delete(id);
      }
    }
    this.changed(record);
  }

  private updateRecord(jobId: string, patch: Partial<JobRecord>): void {
    const record = this.records.get(jobId);
    if (!record) return;
    Object.assign(record, patch);
    this.changed(record);
  }

  private changed(record: JobRecord): void {
    const snapshot = { ...record };
    for (const listener of this.changeListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("A job change listener failed:", error);
      }
    }
    this.schedulePersist();
  }

  /** Loads saved records; jobs that were queued or running are marked interrupted (never re-run). */
  load(): void {
    let raw: string;
    try {
      raw = fs.readFileSync(this.recordsFile, "utf8");
    } catch {
      return;
    }
    let jobs: unknown[] = [];
    try {
      const parsed = JSON.parse(raw) as { jobs?: unknown };
      if (Array.isArray(parsed.jobs)) jobs = parsed.jobs;
    } catch (error) {
      this.app.serviceError(this, `Could not read ${this.recordsFile}:`, error);
      return;
    }
    let interrupted = 0;
    for (const item of jobs.slice(-MAX_JOB_RECORDS)) {
      const result = JobRecordSchema.safeParse(item);
      if (!result.success || this.records.has(result.data.id)) continue;
      const record = result.data;
      if (ACTIVE.has(record.status)) {
        record.status = "interrupted";
        record.endedAt ??= Date.now();
        record.error ??= "Interrupted by a restart";
        interrupted++;
      }
      this.records.set(record.id, record);
    }
    if (interrupted > 0) this.schedulePersist();
  }

  private serialize(): string {
    return `${JSON.stringify({ version: RECORDS_FILE_VERSION, jobs: [...this.records.values()] }, null, 2)}\n`;
  }

  /** Coalesced, ordered, atomic (temp file + rename) writes. */
  private schedulePersist(): void {
    if (this.writeQueued) return;
    this.writeQueued = true;
    this.writeChain = this.writeChain
      .then(async () => {
        this.writeQueued = false;
        const content = this.serialize();
        await fs.promises.mkdir(path.dirname(this.recordsFile), { recursive: true });
        const tmpFile = `${this.recordsFile}.${process.pid}.${++this.tmpCounter}.tmp`;
        await fs.promises.writeFile(tmpFile, content);
        await fs.promises.rename(tmpFile, this.recordsFile);
      })
      .catch((error: unknown) => {
        this.writeQueued = false;
        this.app.serviceError(this, `Could not save job records to ${this.recordsFile}:`, error);
      });
  }

  /** Resolves once every change so far is on disk. */
  async flush(): Promise<void> {
    await this.writeChain;
  }

  private writeNow(): void {
    try {
      fs.mkdirSync(path.dirname(this.recordsFile), { recursive: true });
      const tmpFile = `${this.recordsFile}.${process.pid}.${++this.tmpCounter}.tmp`;
      fs.writeFileSync(tmpFile, this.serialize());
      fs.renameSync(tmpFile, this.recordsFile);
    } catch (error) {
      this.app.serviceError(this, `Could not save job records to ${this.recordsFile}:`, error);
    }
  }
}
