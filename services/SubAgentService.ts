import { setTimeout as delay } from "node:timers/promises";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";
import type Agent from "../Agent.ts";
import { type AgentEventCursor, AgentEventState } from "../state/agentEventState.ts";
import { type SubAgentEntry, SubAgentState } from "../state/subAgentState.ts";
import type { AgentCheckpointData } from "../types.ts";
import { formatAgentId } from "../util/formatAgentId.ts";
import AgentManager from "./AgentManager.ts";

/** How deep sub-agents may nest: a sub-agent's sub-agent is fine, one more level is refused. */
export const MAX_SUB_AGENT_DEPTH = 3;
/** Sub-agents one agent may have working at the same time. */
export const MAX_RUNNING_SUB_AGENTS = 8;
/** A sub-agent that has been idle this long, with its reply already read, is stopped. */
const IDLE_CLEANUP_MS = 30 * 60_000;
const CLEANUP_INTERVAL_MS = 60_000;
/** Children finishing within this window are reported to the parent in one message. */
const NOTIFY_COALESCE_MS = 500;
/** Longest a single read may wait for a sub-agent. */
export const MAX_WAIT_SECONDS = 600;
/** Text returned to the parent is trimmed to this length (start and end kept). */
const REPLY_HEAD = 2_000;
const REPLY_TAIL = 8_000;
/** Unread output kept per sub-agent. */
const MAX_UNREAD_OUTPUT = 50_000;
/** Snapshots of closed sub-agents kept in memory, so resuming one does not need the checkpoint store. */
const MAX_CACHED_CHECKPOINTS = 100;

/**
 * Where saved checkpoints come from, for resuming a sub-agent the cache no longer holds (after a
 * restart, say). Registered by the checkpoint plugin; without one only the in-memory snapshots are used.
 */
export interface SubAgentCheckpointSource {
  latestCheckpoint(agentId: string): Promise<AgentCheckpointData | null>;
}

export type SubAgentStatus = "working" | "idle" | "failed" | "stopped";
/** As reported to the parent: "closed" is a sub-agent that is not running but resumes when sent a message. */
export type SubAgentSnapshotStatus = SubAgentStatus | "closed";

export interface SubAgentRecord {
  /** What the parent calls it, unique among the parent's sub-agents, e.g. "explore-1". */
  name: string;
  agentId: string;
  parentId: string;
  agentType: string;
  displayName: string;
  createdAt: number;
  /** Wake the parent when this sub-agent finishes. */
  notify: boolean;
  status: SubAgentStatus;
  /** The request whose response counts as "finished": the last message the parent sent. */
  finalRequestId: string;
  /** Chat output since the parent last read it. */
  unreadOutput: string;
  /** The reply to {@link finalRequestId}, once it has arrived. */
  reply: string | null;
  /** A reply (or a stop) the parent has not seen yet. */
  replyUnread: boolean;
  /** When the sub-agent last finished or was sent something; drives idle cleanup. */
  lastActiveAt: number;
  /** Set when the parent itself stopped it, so the stop is not reported back. */
  stoppedByParent: boolean;
  /** `reply` is the "it was stopped before it finished" notice, not a reply the sub-agent gave. */
  replyIsStopNotice: boolean;
}

/** What the parent is told about a sub-agent. */
export interface SubAgentSnapshot {
  name: string;
  agentId: string;
  agentType: string;
  status: SubAgentSnapshotStatus;
  /** The question a person has to answer before the sub-agent can carry on. */
  waitingFor: string | null;
  /** The finished reply, when one arrived since the last read. */
  reply: string | null;
  /** Output since the last read, when there is no new reply. */
  output: string;
}

export interface StartSubAgentOptions {
  agentType: string;
  /** Sent in order; the sub-agent is finished once it has answered the last one. */
  messages: string[];
  name?: string | undefined;
  notify?: boolean | undefined;
  /** Shown as the sender of the messages in the sub-agent's chat. */
  from?: string | undefined;
}

/**
 * Background sub-agents: an agent starts one, keeps working, sends it follow-ups, and reads its
 * output — the agent counterpart of background terminals. Each sub-agent is a full agent, listed
 * under its parent, whose questions go to the person like any other agent's.
 *
 * When a sub-agent finishes and the parent has not read the reply, the parent is sent a message
 * with it as soon as the parent is idle, so a parent never has to poll. A sub-agent stops with
 * its parent (see {@link AgentManager.deleteAgent}).
 */
export default class SubAgentService implements TokenRingService {
  readonly name = "SubAgentService";
  description = "Runs sub-agents in the background for an agent and reports back when they finish";

  /** Keyed by the sub-agent's agent id. */
  private readonly records = new Map<string, SubAgentRecord>();
  private readonly unsubscribers = new Map<string, () => void>();
  /** Parents with a notification on its way. */
  private readonly notifying = new Set<string>();
  /** Waiters for a change to a sub-agent, keyed by agent id. */
  private readonly changeWaiters = new Map<string, Set<() => void>>();
  /** Final snapshots of closed sub-agents, by agent id, oldest first. */
  private readonly closedCheckpoints = new Map<string, AgentCheckpointData>();
  /** Resumes in progress, keyed by `parentId:name`, so two messages at once resume it only once. */
  private readonly resuming = new Map<string, Promise<SubAgentRecord>>();
  private checkpointSource: SubAgentCheckpointSource | null = null;

  constructor(private readonly app: TokenRingApp) {}

  setCheckpointSource(source: SubAgentCheckpointSource | null): void {
    this.checkpointSource = source;
  }

  attach(agent: Agent): void {
    agent.initializeState(SubAgentState, {});
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await delay(CLEANUP_INTERVAL_MS, null, { signal });
      } catch {
        return;
      }
      this.cleanUpIdle(Date.now());
    }
  }

  /** Starts a sub-agent of `parent` and sends it `messages`; returns at once. */
  startSubAgent(parent: Agent, { agentType, messages, name, notify = true, from }: StartSubAgentOptions): SubAgentRecord {
    if (messages.length === 0) throw new Error("A sub-agent needs a message to work on.");
    const agentManager = this.app.requireService(AgentManager);
    const config = agentManager.getAgentConfig(agentType);
    if (!config) throw new Error(`There is no agent type "${agentType}". Available: ${agentManager.getAgentTypes().join(", ")}`);

    const depth = agentManager.getAgentDepth(parent) + 1;
    if (depth > MAX_SUB_AGENT_DEPTH) throw new Error(`Sub-agents can only be nested ${MAX_SUB_AGENT_DEPTH} deep; finish this work here instead.`);
    this.checkRunningLimit(parent);

    const finalName = name?.trim() ? this.checkName(parent, name.trim()) : this.nextName(parent, agentType);

    const child = agentManager.spawnSubAgent(parent, agentType);
    const record = this.track(parent, child, { name: finalName, notify, status: "working" });

    for (const message of messages) {
      record.finalRequestId = child.handleInput({ from: from ?? `${parent.config.displayName} (parent agent)`, message });
    }
    return record;
  }

  /**
   * Sends a follow-up; queued if the sub-agent is still busy. It counts as working until it answers.
   * A closed sub-agent (stopped, cleaned up, or lost in a restart) is first resumed from its latest checkpoint.
   */
  async sendToSubAgent(parent: Agent, name: string, message: string, from?: string): Promise<{ record: SubAgentRecord; unreadReply: string | null }> {
    const live = this.liveRecord(parent, name);
    // A reply the parent never read goes back with this call rather than being dropped (the "was
    // stopped" notice is the exception: resuming it answers that).
    const unreadReply = live?.replyUnread && !live.replyIsStopNotice ? trimMiddle(live.reply ?? "", REPLY_HEAD, REPLY_TAIL) : null;
    const record = live && live.status !== "stopped" ? live : await this.resume(parent, name);
    if (record.status !== "working") this.checkRunningLimit(parent);
    const child = this.requireChild(record);
    record.status = "working";
    record.reply = null;
    record.replyUnread = false;
    record.unreadOutput = "";
    record.lastActiveAt = Date.now();
    record.finalRequestId = child.handleInput({ from: from ?? `${parent.config.displayName} (parent agent)`, message });
    this.changed(record);
    return { record, unreadReply };
  }

  /**
   * What the sub-agent has done since the last read; marks it read. With `waitSeconds`, first waits
   * until it finishes, stops, or needs a person to answer something.
   */
  async readSubAgent(
    parent: Agent,
    name: string,
    { waitSeconds = 0, signal }: { waitSeconds?: number; signal?: AbortSignal | undefined } = {},
  ): Promise<SubAgentSnapshot> {
    const record = this.liveRecord(parent, name);
    if (!record) {
      const entry = this.requireEntry(parent, name);
      return { name, agentId: entry.agentId, agentType: entry.agentType, status: "closed", waitingFor: null, reply: null, output: "" };
    }
    const deadline = Date.now() + Math.min(Math.max(0, waitSeconds), MAX_WAIT_SECONDS) * 1000;
    // A question already pending when the wait began doesn't end it (that would turn a long wait into
    // a busy loop); a new one does, so the parent can tell the person.
    const questionAtStart = this.waitingFor(record);
    const newQuestion = () => {
      const question = this.waitingFor(record);
      return question !== null && question !== questionAtStart;
    };
    while (record.status === "working" && !record.replyUnread && !newQuestion() && Date.now() < deadline && !signal?.aborted) {
      await this.nextChange(record, deadline - Date.now(), signal);
    }
    const snapshot = this.snapshot(record);
    record.unreadOutput = "";
    record.replyUnread = false;
    // A stopped sub-agent was only kept so its parent could see that it stopped.
    if (record.status === "stopped") this.records.delete(record.agentId);
    return snapshot;
  }

  /** The parent's sub-agents, running and closed, without marking anything read. */
  listSubAgents(parent: Agent): SubAgentSnapshot[] {
    return this.entriesOf(parent).map(entry => {
      const record = this.liveRecord(parent, entry.name);
      return record
        ? { ...this.snapshot(record), output: "" }
        : { name: entry.name, agentId: entry.agentId, agentType: entry.agentType, status: "closed" as const, waitingFor: null, reply: null, output: "" };
    });
  }

  /** Stops a sub-agent and closes it. It is remembered, so a later message resumes it. Returns false if it was already closed. */
  stopSubAgent(parent: Agent, name: string, reason = "Stopped by its parent agent"): boolean {
    const record = this.liveRecord(parent, name);
    if (!record || record.status === "stopped") {
      this.requireEntry(parent, name);
      if (record) this.records.delete(record.agentId);
      return false;
    }
    record.stoppedByParent = true;
    record.replyUnread = false;
    this.app.requireService(AgentManager).deleteAgent(record.agentId, reason);
    return true;
  }

  /** The record for a sub-agent, looked up by its agent id. */
  getRecord(agentId: string): SubAgentRecord | undefined {
    return this.records.get(agentId);
  }

  /** Called by the app when an agent is deleted: forget a parent's sub-agents, or report a sub-agent stopping. */
  detach(agent: Agent): void {
    for (const record of this.recordsOf(agent.id)) this.forget(record.agentId);

    const record = this.records.get(agent.id);
    if (!record) return;
    // Its last state, for resuming it if the parent sends it another message.
    try {
      this.cacheCheckpoint(agent.generateCheckpoint());
    } catch (error) {
      this.app.serviceError(this, `Could not snapshot sub-agent ${record.name}:`, error);
    }
    this.unsubscribers.get(agent.id)?.();
    this.unsubscribers.delete(agent.id);
    if (record.status !== "stopped") {
      const wasWorking = record.status === "working";
      record.status = "stopped";
      if (!record.stoppedByParent && wasWorking) {
        record.reply = "It was stopped before it finished. Send it a message to resume it where it left off.";
        record.replyIsStopNotice = true;
        record.replyUnread = true;
        this.scheduleNotify(record.parentId);
      }
    }
    this.changed(record);
    // Kept while the parent may still read the stop; removed on that read or with the parent.
    if (!record.replyUnread) this.records.delete(agent.id);
  }

  private follow(record: SubAgentRecord, child: Agent): void {
    const cursor: AgentEventCursor = child.getState(AgentEventState).getEventCursorFromCurrentPosition();
    let replyText = "";
    let lastQuestion: string | null = null;

    const unsubscribe = child.subscribeState(AgentEventState, state => {
      for (const event of state.yieldEventsByCursor(cursor)) {
        if (event.type === "output.chat") {
          replyText += event.message;
          record.unreadOutput += event.message;
          // Never read: keep the end, which is what a later read would show anyway.
          if (record.unreadOutput.length > MAX_UNREAD_OUTPUT) record.unreadOutput = record.unreadOutput.slice(-MAX_UNREAD_OUTPUT);
        } else if (event.type === "agent.response") {
          if (event.requestId !== record.finalRequestId) {
            // An earlier message's answer: part of the output, not the end of the work.
            replyText = "";
            continue;
          }
          record.reply = replyText.trim() || event.message;
          replyText = "";
          record.status = event.status === "error" ? "failed" : "idle";
          record.replyIsStopNotice = false;
          if (event.status === "cancelled") record.reply = `Cancelled: ${event.message}\n\n${record.reply}`.trim();
          record.replyUnread = true;
          record.lastActiveAt = Date.now();
          this.scheduleNotify(record.parentId);
        }
      }

      // A question nobody has answered: point the person at it from the parent's chat, once each.
      const question = this.pendingQuestion(child);
      if (question && question.interactionId !== lastQuestion) {
        lastQuestion = question.interactionId;
        this.app
          .requireService(AgentManager)
          .getAgent(record.parentId)
          ?.infoMessage(`Sub-agent ${record.name} (${formatAgentId(record.agentId)}) is waiting for you to answer in its chat: ${question.message}`);
      }
      this.changed(record);
    });
    this.unsubscribers.set(child.id, unsubscribe);
  }

  /** Once the parent is idle, sends it one message with every reply it has not read. */
  private scheduleNotify(parentId: string): void {
    if (this.notifying.has(parentId)) return;
    this.notifying.add(parentId);
    void this.deliver(parentId).finally(() => {
      this.notifying.delete(parentId);
      // A sub-agent that finished while this one was being delivered.
      if (this.unreadFor(parentId).length > 0 && this.app.getService(AgentManager)?.getAgent(parentId)) this.scheduleNotify(parentId);
    });
  }

  private async deliver(parentId: string): Promise<void> {
    await delay(NOTIFY_COALESCE_MS);
    const parent = this.app.getService(AgentManager)?.getAgent(parentId);
    if (!parent) return;
    try {
      // A busy parent may read the replies itself (agent_output) before it is done; then there is nothing to send.
      await parent.waitForState(AgentEventState, state => state.idle, parent.agentShutdownSignal);
    } catch {
      return;
    }
    const ready = this.unreadFor(parentId);
    if (ready.length === 0) return;

    const sections = ready.map(record => {
      // A sub-agent closed after it finished (by a person, or an idle limit) still "finished".
      const verb = record.replyIsStopNotice ? "was stopped" : record.status === "failed" ? "failed" : "finished";
      const body = trimMiddle(record.reply ?? "", REPLY_HEAD, REPLY_TAIL);
      record.replyUnread = false;
      record.unreadOutput = "";
      if (record.status === "stopped") this.records.delete(record.agentId);
      return `### ${record.name} (${record.displayName}) ${verb}\n\n${body}`;
    });
    const message = [
      `[Sub-agent update. This is not a message from the user.]`,
      "",
      ...sections,
      "",
      "Carry on with your task using these results. Use agent_send to ask a sub-agent for more, or agent_stop once you no longer need it.",
    ].join("\n");
    try {
      parent.handleInput({ from: ready.length === 1 ? `Sub-agent ${ready[0]!.name}` : "Sub-agents", message });
    } catch (error) {
      // The parent shut down while this was being put together.
      this.app.serviceError(this, "Could not report finished sub-agents to their parent:", error);
    }
  }

  private unreadFor(parentId: string): SubAgentRecord[] {
    return this.recordsOf(parentId).filter(record => record.replyUnread && record.notify);
  }

  private cleanUpIdle(now: number): void {
    const agentManager = this.app.getService(AgentManager);
    if (!agentManager) return;
    for (const record of this.records.values()) {
      if (record.status === "working" || record.status === "stopped") continue;
      // An unread reply the parent will be sent keeps it open; one it only reads on request (notify:
      // false) survives the close, since the record is kept until read.
      if (record.replyUnread && record.notify) continue;
      if (now - record.lastActiveAt < IDLE_CLEANUP_MS) continue;
      record.stoppedByParent = true;
      agentManager.deleteAgent(record.agentId, "Sub-agent was idle and its results had been read");
    }
  }

  private snapshot(record: SubAgentRecord): SubAgentSnapshot {
    return {
      name: record.name,
      agentId: record.agentId,
      agentType: record.agentType,
      status: record.status,
      waitingFor: this.waitingFor(record),
      reply: record.replyUnread ? trimMiddle(record.reply ?? "", REPLY_HEAD, REPLY_TAIL) : null,
      output: record.replyUnread ? "" : trimMiddle(record.unreadOutput, REPLY_HEAD, REPLY_TAIL),
    };
  }

  private waitingFor(record: SubAgentRecord): string | null {
    const child = this.app.getService(AgentManager)?.getAgent(record.agentId);
    return child ? (this.pendingQuestion(child)?.message ?? null) : null;
  }

  private pendingQuestion(child: Agent): { interactionId: string; message: string } | null {
    const item = child.getState(AgentEventState).currentlyExecutingInputItem;
    const question = item?.executionState.availableInteractions.find(interaction => interaction.type === "question");
    return question ? { interactionId: question.interactionId, message: question.message.trim() } : null;
  }

  private recordsOf(parentId: string): SubAgentRecord[] {
    return [...this.records.values()].filter(record => record.parentId === parentId);
  }

  /** The running (or just stopped) sub-agent called `name`. */
  private liveRecord(parent: Agent, name: string): SubAgentRecord | undefined {
    return this.recordsOf(parent.id).find(candidate => candidate.name === name);
  }

  private entriesOf(parent: Agent): SubAgentEntry[] {
    try {
      return parent.getState(SubAgentState).subAgents;
    } catch {
      return [];
    }
  }

  private requireEntry(parent: Agent, name: string): SubAgentEntry {
    const entry = this.entriesOf(parent).find(candidate => candidate.name === name);
    if (!entry) {
      const names = this.entriesOf(parent).map(candidate => candidate.name);
      throw new Error(`No sub-agent named ${name}.${names.length > 0 ? ` Yours: ${names.join(", ")}` : " You have not started any."}`);
    }
    return entry;
  }

  private requireChild(record: SubAgentRecord): Agent {
    const child = this.app.requireService(AgentManager).getAgent(record.agentId);
    if (!child) throw new Error(`Sub-agent ${record.name} is no longer running.`);
    return child;
  }

  private checkRunningLimit(parent: Agent): void {
    const running = this.recordsOf(parent.id).filter(record => record.status === "working").length;
    if (running >= MAX_RUNNING_SUB_AGENTS) {
      throw new Error(`${running} sub-agents are already working; wait for one to finish or stop one (at most ${MAX_RUNNING_SUB_AGENTS}).`);
    }
  }

  private checkName(parent: Agent, name: string): string {
    if (!/^[\w.-]{1,40}$/.test(name)) throw new Error("A sub-agent name may only use letters, digits, '.', '_' and '-' (at most 40).");
    if (this.entriesOf(parent).some(entry => entry.name === name)) {
      throw new Error(`You already have a sub-agent named ${name}. Send it a message with agent_send, or pick another name.`);
    }
    return name;
  }

  private nextName(parent: Agent, agentType: string): string {
    const base = agentType.replace(/[^\w.-]+/g, "-").slice(0, 32) || "agent";
    const taken = new Set(this.entriesOf(parent).map(entry => entry.name));
    let index = 1;
    while (taken.has(`${base}-${index}`)) index++;
    return `${base}-${index}`;
  }

  /** Starts tracking `child` as the parent's sub-agent `name`, and remembers it in the parent's state. */
  private track(parent: Agent, child: Agent, { name, notify, status }: { name: string; notify: boolean; status: SubAgentStatus }): SubAgentRecord {
    const previous = this.entriesOf(parent).find(entry => entry.name === name);
    const record: SubAgentRecord = {
      name,
      agentId: child.id,
      parentId: parent.id,
      agentType: child.config.agentType,
      displayName: child.config.displayName,
      createdAt: previous?.createdAt ?? Date.now(),
      notify,
      status,
      finalRequestId: "",
      unreadOutput: "",
      reply: null,
      replyUnread: false,
      lastActiveAt: Date.now(),
      stoppedByParent: false,
      replyIsStopNotice: false,
    };
    this.records.set(child.id, record);
    this.follow(record, child);
    const entry: SubAgentEntry = { name, agentType: record.agentType, displayName: record.displayName, agentId: child.id, notify, createdAt: record.createdAt };
    // A sub-agent still running is never forgotten, or its name could be handed out again.
    const running = new Set(this.recordsOf(parent.id).map(other => other.name));
    try {
      parent.mutateState(SubAgentState, state => state.remember(entry, running));
    } catch {
      // A parent created before this service was installed has no slice; give it one.
      parent.initializeState(SubAgentState, {});
      parent.mutateState(SubAgentState, state => state.remember(entry, running));
    }
    return record;
  }

  /**
   * Brings a closed sub-agent back from its latest checkpoint, as the same name under the same parent.
   * It keeps its agent id unless another agent is running with it (then it becomes a copy with a new id).
   */
  private resume(parent: Agent, name: string): Promise<SubAgentRecord> {
    const key = `${parent.id}:${name}`;
    const pending = this.resuming.get(key);
    if (pending) return pending;
    const work = this.doResume(parent, name).finally(() => this.resuming.delete(key));
    this.resuming.set(key, work);
    return work;
  }

  private async doResume(parent: Agent, name: string): Promise<SubAgentRecord> {
    const entry = this.requireEntry(parent, name);
    const stale = this.liveRecord(parent, name);
    if (stale) this.records.delete(stale.agentId);

    const agentManager = this.app.requireService(AgentManager);
    // Already running under this parent (restored with the app, say) but no longer tracked: pick it up again.
    const running = agentManager.getAgent(entry.agentId);
    if (running?.parentAgentId === parent.id) return this.track(parent, running, { name, notify: entry.notify, status: "idle" });

    if (agentManager.getAgentDepth(parent) + 1 > MAX_SUB_AGENT_DEPTH) throw new Error(`Sub-agents can only be nested ${MAX_SUB_AGENT_DEPTH} deep.`);
    this.checkRunningLimit(parent);
    if (!agentManager.getAgentConfig(entry.agentType)) {
      throw new Error(`Sub-agent ${name} can't be resumed: its agent type "${entry.agentType}" no longer exists. Start a new one.`);
    }

    let checkpoint: AgentCheckpointData | null = this.closedCheckpoints.get(entry.agentId) ?? null;
    if (!checkpoint && this.checkpointSource) {
      try {
        checkpoint = await this.checkpointSource.latestCheckpoint(entry.agentId);
      } catch (error) {
        this.app.serviceError(this, `Could not load a checkpoint for sub-agent ${name}:`, error);
      }
    }
    // The parent may have been shut down while the checkpoint loaded: a child started now would
    // work for nobody, and nothing would ever clean it up.
    if (agentManager.getAgent(parent.id) !== parent) throw new Error(`Sub-agent ${name} was not resumed: its parent agent has stopped.`);
    // Someone else resumed it (or it was restarted) while the checkpoint loaded.
    const raced = this.liveRecord(parent, name);
    if (raced && raced.status !== "stopped") return raced;
    if (!checkpoint) throw new Error(`Sub-agent ${name} is closed and has no saved checkpoint to resume from. Start a new one.`);

    const child = agentManager.spawnSubAgentFromCheckpoint(parent, checkpoint);
    this.closedCheckpoints.delete(entry.agentId);
    const record = this.track(parent, child, { name, notify: entry.notify, status: "idle" });
    parent.infoMessage(`Resumed sub-agent ${name} from its last checkpoint.`);
    return record;
  }

  private cacheCheckpoint(checkpoint: AgentCheckpointData): void {
    this.closedCheckpoints.delete(checkpoint.agentId);
    this.closedCheckpoints.set(checkpoint.agentId, checkpoint);
    while (this.closedCheckpoints.size > MAX_CACHED_CHECKPOINTS) {
      const oldest = this.closedCheckpoints.keys().next().value;
      if (oldest === undefined) break;
      this.closedCheckpoints.delete(oldest);
    }
  }

  private forget(agentId: string): void {
    this.unsubscribers.get(agentId)?.();
    this.unsubscribers.delete(agentId);
    const record = this.records.get(agentId);
    this.records.delete(agentId);
    if (record) this.changed(record);
  }

  private changed(record: SubAgentRecord): void {
    const waiters = this.changeWaiters.get(record.agentId);
    if (!waiters) return;
    this.changeWaiters.delete(record.agentId);
    for (const wake of waiters) wake();
  }

  private nextChange(record: SubAgentRecord, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      let waiters = this.changeWaiters.get(record.agentId);
      if (!waiters) {
        waiters = new Set();
        this.changeWaiters.set(record.agentId, waiters);
      }
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        waiters.delete(done);
        if (waiters.size === 0 && this.changeWaiters.get(record.agentId) === waiters) this.changeWaiters.delete(record.agentId);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, timeoutMs));
      signal?.addEventListener("abort", done, { once: true });
      waiters.add(done);
    });
  }
}
