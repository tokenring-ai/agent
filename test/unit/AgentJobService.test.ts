import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import type Agent from "../../Agent.ts";
import type { AgentEventEnvelope } from "../../AgentEvents.ts";
import { AgentJobsConfigSchema, type ParsedAgentJobsConfig } from "../../schema.ts";
import AgentJobService, { type JobApprovalPolicy, JobCancelledError, type JobSession, type JobSpec, LimitError } from "../../services/AgentJobService.ts";
import AgentManager from "../../services/AgentManager.ts";
import { AgentEventState } from "../../state/agentEventState.ts";
import createTestingAgent from "../createTestingAgent.test.ts";

const services: AgentJobService[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const service of services.splice(0)) {
    service.stop();
    await service.flush();
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-jobs-"));
  tempDirs.push(dir);
  return path.join(dir, "agent-jobs.json");
}

type FakeChat = {
  policies: Map<string, JobApprovalPolicy>;
  written: Map<string, JobApprovalPolicy>;
  enabled: Map<string, string[]>;
  defaultPolicy: JobApprovalPolicy;
};

function setup(
  config: Partial<ParsedAgentJobsConfig> = {},
  { recordsFile = tempFile(), keepFailedAgentMs }: { recordsFile?: string; keepFailedAgentMs?: number } = {},
) {
  const app = createTestingApp() as TokenRingApp;
  const starter = createTestingAgent(app);
  const agentManager = app.requireService(AgentManager);
  agentManager.addAgentConfigs(starter.config, { ...starter.config, agentType: "other-agent", displayName: "Other Agent" });
  const jobs = app.addService(AgentJobService, new AgentJobService(app, { recordsFile, config: AgentJobsConfigSchema.parse(config), keepFailedAgentMs }));
  services.push(jobs);

  const chat: FakeChat = {
    policies: new Map(),
    written: new Map(),
    enabled: new Map(),
    defaultPolicy: { autoToolApprovalLevel: 4, toolApprovalMode: "ask" },
  };
  jobs.setChatIntegration({
    approvalPolicyOf: agent => chat.written.get(agent.id) ?? chat.policies.get(agent.id) ?? { autoToolApprovalLevel: 6, toolApprovalMode: "auto" },
    defaultApprovalPolicy: () => chat.defaultPolicy,
    setApprovalPolicy: (agent, policy) => chat.written.set(agent.id, policy),
    enableTools: (agent, tools) => {
      // Recorded with how many inputs the agent had seen, to prove it happened before the first.
      chat.enabled.set(agent.id, [...tools, `inputs:${inputsTo(agent).length}`]);
    },
  });
  return { app, starter, agentManager, jobs, chat, recordsFile };
}

function personSpec(label = "job", extra: Partial<JobSpec> = {}): JobSpec {
  return { owner: "queue", label, agentType: "mock-agent", origin: { kind: "person", label: "Me" }, ...extra };
}

function agentSpec(agent: Agent, label = "job", extra: Partial<JobSpec> = {}): JobSpec {
  return { owner: "tasks", label, agentType: "mock-agent", origin: { kind: "agent", agent }, ...extra };
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function inputsTo(agent: Agent): string[] {
  return agent
    .getState(AgentEventState)
    .events.filter(event => event.type === "input.received")
    .map(event => event.input.message);
}

function queuedRequest(agent: Agent, message: string): string | undefined {
  return agent.getState(AgentEventState).inputQueue.find(item => item.request.input.message === message)?.request.requestId;
}

/** Makes the queued request the one "running", as the agent loop would. */
function makeCurrent(agent: Agent, requestId: string): void {
  agent.mutateState(AgentEventState, state => {
    state.currentlyExecutingInputItem = state.inputQueue.find(item => item.request.requestId === requestId) ?? null;
  });
}

/** Plays the agent loop for the input with this message: output, then the response. */
async function respondTo(agent: Agent, message: string, text: string, status: "success" | "error" | "cancelled" = "success"): Promise<void> {
  await waitFor(() => queuedRequest(agent, message) !== undefined);
  const requestId = queuedRequest(agent, message)!;
  agent.mutateState(AgentEventState, state => {
    state.currentlyExecutingInputItem = state.inputQueue.find(item => item.request.requestId === requestId) ?? null;
    state.emit({ type: "output.chat", message: text, timestamp: Date.now() });
    state.emit({ type: "agent.response", requestId, status, message: `${status}: ${text}`, timestamp: Date.now() });
    state.emit({ type: "input.execution", requestId, status: "finished", timestamp: Date.now() });
  });
}

describe("AgentJobService lineage and limits", () => {
  it("counts depth across owners and refuses the fourth level", () => {
    const { jobs, agentManager } = setup();
    const a = jobs.startJob(personSpec("queue item"));
    const b = jobs.startJob({ ...agentSpec(a.agent, "task"), owner: "tasks" });
    const c = jobs.startJob({ ...agentSpec(b.agent, "workflow"), owner: "workflow" });
    expect([a.record.depth, b.record.depth, c.record.depth]).toEqual([1, 2, 3]);
    expect(b.record.parentJobId).toBe(a.id);
    expect(c.record.rootJobId).toBe(a.id);
    // Job agents are sub-agents of the agent that started them.
    // Lineage is the job tree's: job agents are top-level, so one finishing never deletes another.
    expect(b.agent.parentAgentId).toBeNull();

    expect(() => jobs.startJob({ ...agentSpec(c.agent, "too deep"), owner: "scheduler" })).toThrow(LimitError);
    try {
      jobs.startJob(agentSpec(c.agent, "too deep"));
    } catch (error) {
      expect((error as LimitError).limit).toBe("maxDepth");
      expect((error as Error).message).toContain("agent.jobs.maxDepth");
    }

    // A plain sub-agent under a job agent counts as part of that job.
    const helper = agentManager.spawnSubAgent(c.agent, "mock-agent");
    expect(jobs.jobOfAgentTree(helper)).toBe(c.id);
    expect(jobs.jobOfAgentTree(agentManager.spawnSubAgent(helper, "mock-agent"))).toBe(c.id);
    expect(() => jobs.startJob(agentSpec(helper, "via helper"))).toThrow(LimitError);
  });

  it("an agent outside any job starts a top-level job", () => {
    const { jobs, starter } = setup();
    const job = jobs.startJob(agentSpec(starter));
    expect(job.record).toMatchObject({ depth: 1, parentJobId: null, rootJobId: job.id, origin: { kind: "agent", agentId: starter.id } });
    expect(job.agent.parentAgentId).toBeNull();
  });

  it("a child job keeps running when the job that started it succeeds, or its starter's chat is closed", async () => {
    const { jobs, agentManager, starter } = setup();
    const parent = jobs.startJob(agentSpec(starter, "parent"));
    const child = jobs.startJob(agentSpec(parent.agent, "child"));
    await parent.finish("succeeded");
    expect(agentManager.getAgent(parent.agent.id)).toBeNull();
    expect(jobs.get(child.id)?.status).toBe("running");
    expect(agentManager.getAgent(child.agent.id)).not.toBeNull();

    agentManager.deleteAgent(starter.id, "chat closed");
    expect(jobs.get(child.id)?.status).toBe("running");
    // Cancelling, unlike finishing, still reaches everything the job started.
    const grandchild = jobs.startJob(agentSpec(child.agent, "grandchild"));
    jobs.cancel(child.id, "stop");
    expect(jobs.get(grandchild.id)?.status).toBe("cancelled");
  });

  it("parentJobId places a job in a tree whose origin agent is gone", async () => {
    const { jobs } = setup();
    const group = jobs.startJob(personSpec("run group"));
    await group.finish("succeeded");
    const later = jobs.startJob(personSpec("group item", { parentJobId: group.id }));
    expect(later.record).toMatchObject({ depth: 2, parentJobId: group.id, rootJobId: group.id });
    expect(later.agent.parentAgentId).toBeNull();
    expect(() => jobs.startJob(personSpec("orphan", { parentJobId: "no-such-job" }))).toThrow("Unknown parent job");
  });

  it("limits the jobs one tree may start", () => {
    const { jobs } = setup({ maxDescendants: 3, maxConcurrent: 20 });
    const root = jobs.startJob(personSpec("root"));
    const child = jobs.startJob(agentSpec(root.agent, "child 1"));
    jobs.startJob(agentSpec(root.agent, "child 2"));
    jobs.startJob(agentSpec(child.agent, "grandchild"));
    expect(() => jobs.startJob(agentSpec(root.agent, "one too many"))).toThrow(/maxDescendants/);
    // Another tree is unaffected.
    expect(() => jobs.startJob(personSpec("other root"))).not.toThrow();
  });

  it("fails at maxConcurrent by default with a clear message", async () => {
    const { jobs } = setup({ maxConcurrent: 2 });
    const first = jobs.startJob(personSpec("one"));
    jobs.startJob(personSpec("two"));
    expect(() => jobs.startJob(personSpec("three"))).toThrow(/2 jobs are already running \(agent\.jobs\.maxConcurrent\)/);
    // A finished job frees its slot.
    await first.finish("succeeded");
    expect(() => jobs.startJob(personSpec("three"))).not.toThrow();
  });

  it("waits for a slot with { wait: true }", async () => {
    const { jobs } = setup({ maxConcurrent: 1 });
    const first = jobs.startJob(personSpec("one"));
    let started: JobSession | null = null;
    const waiting = jobs.startJob(personSpec("two"), { wait: true }).then(session => {
      started = session;
      return session;
    });
    await Bun.sleep(10);
    expect(started).toBeNull();
    const queued = jobs.list({ status: ["queued"] });
    expect(queued.map(job => job.label)).toEqual(["two"]);

    await first.finish("succeeded");
    const second = await waiting;
    expect(second.record.status).toBe("running");
    expect(second.record.startedAt).not.toBeNull();
  });

  it("cancels a waiting start, by id or by its signal", async () => {
    const { jobs } = setup({ maxConcurrent: 1 });
    jobs.startJob(personSpec("one"));
    const byId = jobs.startJob(personSpec("two"), { wait: true });
    const [queued] = jobs.list({ status: ["queued"] });
    expect(jobs.cancel(queued!.id, "not needed")).toBe(true);
    expect(byId).rejects.toBeInstanceOf(JobCancelledError);
    expect(jobs.get(queued!.id)?.status).toBe("cancelled");

    const controller = new AbortController();
    const bySignal = jobs.startJob(personSpec("three"), { wait: true, signal: controller.signal });
    controller.abort("changed my mind");
    await expect(bySignal).rejects.toThrow("changed my mind");
  });

  it("startJobWhenFree gives the id while waiting, and rejects (never throws) when refused", async () => {
    const { jobs } = setup({ maxConcurrent: 1, maxDepth: 1 });
    const first = jobs.startJob(personSpec("one"));
    const pending = jobs.startJobWhenFree(personSpec("two"));
    expect(pending.id).not.toBeNull();
    expect(jobs.get(pending.id!)?.status).toBe("queued");
    await first.finish("succeeded");
    const second = await pending.session;
    expect(second.id).toBe(pending.id!);

    // Depth is refused before a record exists: no id, and the promise rejects.
    let refused: ReturnType<AgentJobService["startJobWhenFree"]> | null = null;
    expect(() => {
      refused = jobs.startJobWhenFree(agentSpec(second.agent, "too deep"));
    }).not.toThrow();
    expect(refused!.id).toBeNull();
    await expect(refused!.session).rejects.toBeInstanceOf(LimitError);
    // startJob in wait mode rejects too.
    await expect(jobs.startJob(agentSpec(second.agent, "deep"), { wait: true })).rejects.toBeInstanceOf(LimitError);
  });
});

describe("AgentJobService approvals and people", () => {
  it("snapshots the starting agent's policy, capped at maxAutoApprovalLevel", () => {
    const { jobs, starter, chat } = setup();
    chat.policies.set(starter.id, { autoToolApprovalLevel: 3, toolApprovalMode: "reject" });
    const low = jobs.startJob(agentSpec(starter));
    expect(chat.written.get(low.agent.id)).toEqual({ autoToolApprovalLevel: 3, toolApprovalMode: "reject" });

    chat.policies.set(starter.id, { autoToolApprovalLevel: 8, toolApprovalMode: "auto" });
    const high = jobs.startJob(agentSpec(starter));
    expect(chat.written.get(high.agent.id)).toEqual({ autoToolApprovalLevel: 5, toolApprovalMode: "auto" });

    // Later changes to the starter do not reach the job.
    chat.policies.set(starter.id, { autoToolApprovalLevel: 1, toolApprovalMode: "reject" });
    expect(chat.written.get(high.agent.id)?.autoToolApprovalLevel).toBe(5);
    expect(jobs.isPolicyPinned(high.agent.id)).toBe(true);
    expect(jobs.isPolicyPinned(starter.id)).toBe(false);
  });

  it("a job's maxApprovalLevel raises its cap above maxAutoApprovalLevel, never above approvalCeiling", () => {
    const { jobs, chat } = setup({ maxAutoApprovalLevel: 5, approvalCeiling: 7 });
    chat.defaultPolicy = { autoToolApprovalLevel: 9, toolApprovalMode: "auto" };
    const seven = jobs.startJob(personSpec("seven", { maxApprovalLevel: 7 }));
    expect(chat.written.get(seven.agent.id)?.autoToolApprovalLevel).toBe(6);
    expect(seven.record.approvalLevel).toBe(7);
    // The fake agent type's own level is 6, so use a policy that records the cap directly via the record.
    const lower = jobs.startJob(personSpec("three", { maxApprovalLevel: 3 }));
    expect(chat.written.get(lower.agent.id)?.autoToolApprovalLevel).toBe(3);
    const plain = jobs.startJob(personSpec("plain"));
    expect(plain.record.approvalLevel).toBe(5);
    expect(chat.written.get(plain.agent.id)?.autoToolApprovalLevel).toBe(5);
  });

  it("caps maxApprovalLevel at the ceiling, and the ceiling can not be configured to 8 or more", () => {
    const { jobs, chat } = setup({ maxAutoApprovalLevel: 5, approvalCeiling: 5 });
    chat.defaultPolicy = { autoToolApprovalLevel: 9, toolApprovalMode: "auto" };
    const job = jobs.startJob(personSpec("greedy", { maxApprovalLevel: 7 }));
    expect(job.record.approvalLevel).toBe(5);
    expect(chat.written.get(job.agent.id)?.autoToolApprovalLevel).toBe(5);
    expect(AgentJobsConfigSchema.safeParse({ approvalCeiling: 8 }).success).toBe(false);
    expect(AgentJobsConfigSchema.parse({}).approvalCeiling).toBe(5);
    expect(AgentJobsConfigSchema.parse({ approvalCeiling: 7 }).approvalCeiling).toBe(7);
  });

  it("assertApprovalLevel names the ceiling", () => {
    const { jobs } = setup({ approvalCeiling: 6 });
    expect(() => jobs.assertApprovalLevel(6)).not.toThrow();
    expect(() => jobs.assertApprovalLevel(undefined)).not.toThrow();
    expect(() => jobs.assertApprovalLevel(7)).toThrow(/ceiling of 6/);
  });

  it("reports the policy for forms, with escalation registered by the bot plugin", () => {
    const { jobs } = setup({ maxAutoApprovalLevel: 6, approvalCeiling: 4, defaultMaxCostUsd: 2 });
    expect(jobs.getJobPolicy()).toEqual({ defaultApprovalLevel: 4, approvalCeiling: 4, defaultMaxCostUsd: 2, escalationConfigured: false });
    jobs.setEscalationConfigured(() => true);
    expect(jobs.getJobPolicy().escalationConfigured).toBe(true);
    expect(setup().jobs.getJobPolicy().defaultMaxCostUsd).toBeNull();
  });

  it("records refusals on the job (first 20 listed, all counted), also for a helper under the job agent", () => {
    const { jobs, agentManager } = setup();
    const job = jobs.startJob(personSpec("report"));
    jobs.recordRefusal(job.agent, { tool: "db_write", message: "Write 3 rows\nmore detail", level: 7 });
    const helper = agentManager.spawnSubAgent(job.agent, "mock-agent");
    jobs.recordRefusal(helper, { tool: "shell", message: "rm", level: 8 });
    expect(job.record.refusalCount).toBe(2);
    expect(job.record.refusals[0]).toEqual({ tool: "db_write", message: "Write 3 rows", level: 7 });
    for (let i = 0; i < 30; i++) jobs.recordRefusal(job.agent, { tool: "t", message: `m${i}`, level: 6 });
    expect(job.record.refusals).toHaveLength(20);
    expect(job.record.refusalCount).toBe(32);
    // An agent outside any job records nothing.
    const { jobs: other, starter } = setup();
    other.recordRefusal(starter, { tool: "x", message: "y", level: 6 });
    expect(other.list()).toEqual([]);
  });

  it("an agent's approval that nobody can answer calls onUnanswered", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec("ask"));
    expect(job.agent.answerTimeoutSeconds).toBe(0);
    const pending = job.run({ from: "Queue", message: "do" });
    await waitFor(() => queuedRequest(job.agent, "do") !== undefined);
    makeCurrent(job.agent, queuedRequest(job.agent, "do")!);
    let unanswered = 0;
    const approved = await job.agent.askForApproval({ message: "Delete?", onUnanswered: () => unanswered++ });
    expect(approved).toBe(false);
    expect(unanswered).toBe(1);
    await job.finish("succeeded");
    void pending;
  });

  it("records questions answered by default on the job (capped at 20, all counted), and never approvals", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec("ask"));
    const pending = job.run({ from: "Queue", message: "do" });
    await waitFor(() => queuedRequest(job.agent, "do") !== undefined);
    makeCurrent(job.agent, queuedRequest(job.agent, "do")!);

    // A refused approval is a refusal only: no double record.
    expect(await job.agent.askForApproval({ message: "Delete?" })).toBe(false);
    expect(job.record.unansweredCount).toBe(0);

    const text = await job.agent.askQuestion({ message: "Which branch?\nmore", question: { type: "text", label: "Branch", defaultValue: "main" } });
    expect(text).toBe("main");
    expect(job.record.unansweredCount).toBe(1);
    expect(job.record.unanswered[0]).toMatchObject({ question: "Which branch?", answer: "main", reason: "nobody" });
    expect(typeof job.record.unanswered[0]!.at).toBe("number");

    await job.agent.askForText({ message: "Your name?", label: "Name" });
    expect(job.record.unanswered[1]).toMatchObject({ question: "Your name?", answer: "(no answer)" });

    for (let i = 0; i < 30; i++) await job.agent.askForText({ message: `q${i}`, label: "x" });
    expect(job.record.unanswered).toHaveLength(20);
    expect(job.record.unansweredCount).toBe(32);

    // A person could be reached but did not answer in time.
    const second = jobs.startJob(personSpec("late"));
    const secondRun = second.run({ from: "Queue", message: "go" });
    await waitFor(() => queuedRequest(second.agent, "go") !== undefined);
    makeCurrent(second.agent, queuedRequest(second.agent, "go")!);
    second.agent.answerTimeoutSeconds = 0.03;
    await second.agent.askQuestion({ message: "Which file?", question: { type: "text", label: "File", defaultValue: "a.txt" } });
    expect(second.record.unanswered[0]).toMatchObject({ question: "Which file?", answer: "a.txt", reason: "deadline" });
    await second.finish("succeeded");
    void secondRun;
    await job.finish("succeeded");
    void pending;
  });

  it("uses the default policy for a person or schedule, and never raises the agent type's own level", () => {
    const { jobs, chat } = setup({ maxAutoApprovalLevel: 5 });
    chat.defaultPolicy = { autoToolApprovalLevel: 4, toolApprovalMode: "ask" };
    const job = jobs.startJob({ ...personSpec(), origin: { kind: "schedule", scheduleId: "nightly" } });
    // The fake's own level for a new agent is 6, so the default's 4 wins.
    expect(chat.written.get(job.agent.id)).toEqual({ autoToolApprovalLevel: 4, toolApprovalMode: "ask" });
    expect(job.record.origin).toEqual({ kind: "schedule", scheduleId: "nightly" });
  });

  it("job agents wait for an answer up to the job's time limit only when a person can be reached", () => {
    const { jobs } = setup({ maxConcurrent: 20 });
    expect(jobs.startJob(personSpec()).agent.answerTimeoutSeconds).toBe(0);

    const unregister = jobs.setHumanReachable(agentType => agentType === "mock-agent");
    expect(jobs.startJob(personSpec()).agent.answerTimeoutSeconds).toBe(1800);
    expect(jobs.startJob(personSpec("short", { limits: { timeoutSeconds: 120 } })).agent.answerTimeoutSeconds).toBe(120);
    // No time limit: wait until answered.
    expect(jobs.startJob(personSpec("open", { limits: { timeoutSeconds: 0 } })).agent.answerTimeoutSeconds).toBeNull();
    expect(jobs.startJob({ ...personSpec(), agentType: "other-agent" }).agent.answerTimeoutSeconds).toBe(0);

    unregister();
    expect(jobs.startJob(personSpec()).agent.answerTimeoutSeconds).toBe(0);
  });

  it("pins the deadline on the job agent: it doesn't follow its starter, and its own sub-agents follow it", () => {
    const { jobs, starter, agentManager } = setup();
    starter.answerTimeoutSeconds = null;
    const job = jobs.startJob(agentSpec(starter));
    expect(job.agent.getAnswerTimeoutSeconds()).toBe(0);
    expect(agentManager.spawnSubAgent(job.agent, "mock-agent").getAnswerTimeoutSeconds()).toBe(0);
  });

  it("a job agent nobody can reach refuses an approval at once, without posting it", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec());
    await expect(job.agent.askForApproval({ message: "delete it?", defaultValue: true })).resolves.toBe(false);
    const events = job.agent.getState(AgentEventState).events;
    expect(events.some(event => event.type === "output.info" && event.message.includes("refused: delete it?"))).toBe(true);
  });
});

describe("AgentJobService run()", () => {
  it("sends the input, follows events and maps the response", async () => {
    const { jobs, chat } = setup();
    const events: AgentEventEnvelope[] = [];
    const job = jobs.startJob(personSpec("run", { enableTools: ["task_report"], onEvent: event => events.push(event) }));
    expect(chat.enabled.get(job.agent.id)).toEqual(["task_report", "inputs:0"]);

    const pending = job.run({ from: "Queue", message: "do it" });
    await respondTo(job.agent, "do it", "Done.");
    expect(await pending).toMatchObject({ status: "success", output: "Done.", message: "success: Done." });
    expect(events.map(event => event.type)).toContain("output.chat");

    const failing = job.run({ from: "Queue", message: "again" });
    await respondTo(job.agent, "again", "Broke", "error");
    expect(await failing).toMatchObject({ status: "error", message: "error: Broke" });

    const record = await job.finish("succeeded", "All done");
    expect(record).toMatchObject({ status: "succeeded", summary: "All done" });
    // An ended job sends nothing: the run is cancelled with the reason, and no engine end kind (its owner finished it).
    const late = await job.run({ from: "Queue", message: "late" });
    expect(late).toMatchObject({ status: "cancelled", requestId: null });
    expect(late.message).toContain("already ended (succeeded)");
    expect(late.ended).toBeUndefined();
    expect(job.ended).toBeNull();
  });

  it("reports why the engine ended the job, on the step and the session", async () => {
    const { jobs, agentManager } = setup();
    const cancelled = jobs.startJob(personSpec("cancelled"));
    const running = cancelled.run({ from: "x", message: "work" });
    await waitFor(() => queuedRequest(cancelled.agent, "work") !== undefined);
    jobs.cancel(cancelled.id, "no longer needed");
    expect(await running).toMatchObject({ status: "cancelled", ended: "cancelled" });
    expect(cancelled.ended).toBe("cancelled");
    const after = await cancelled.run({ from: "x", message: "again" });
    expect(after).toMatchObject({ status: "cancelled", ended: "cancelled", requestId: null });
    expect(after.message).toContain("no longer needed");

    const stopped = jobs.startJob(personSpec("stopped"));
    agentManager.deleteAgent(stopped.agent.id, "closed");
    expect((await stopped.run({ from: "x", message: "w" })).ended).toBe("agentStopped");

    const shutdown = jobs.startJob(personSpec("shutdown"));
    const inFlight = shutdown.run({ from: "x", message: "w" });
    await waitFor(() => queuedRequest(shutdown.agent, "w") !== undefined);
    jobs.stop();
    expect((await inFlight).ended).toBe("shutdown");
  });

  it("waits for the agent to be idle first", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec());
    const busy = job.agent.handleInput({ from: "init", message: "initial command" });
    const pending = job.run({ from: "Queue", message: "after init" });
    await Bun.sleep(20);
    expect(inputsTo(job.agent)).toEqual(["initial command"]);
    await respondTo(job.agent, "initial command", "ready");
    expect(busy).toBeString();
    await respondTo(job.agent, "after init", "ok");
    expect((await pending).status).toBe("success");
  });

  it("an aborted run signal on an idle agent sends nothing", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec());
    const result = await job.run({ from: "Queue", message: "never" }, { signal: AbortSignal.abort("stop") });
    expect(result).toMatchObject({ status: "cancelled", requestId: null, message: "stop" });
    expect(inputsTo(job.agent)).toEqual([]);
    // Only that run: the job carries on.
    expect(job.record.status).toBe("running");
  });

  it("a cancelled run of a queued input uses cancelInput, not an abort of the running one", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec());
    const controller = new AbortController();
    const pending = job.run({ from: "Queue", message: "queued work" }, { signal: controller.signal });
    await waitFor(() => queuedRequest(job.agent, "queued work") !== undefined);
    controller.abort("not now");
    const result = await pending;
    expect(result.status).toBe("cancelled");
    const response = job.agent.getState(AgentEventState).events.find(event => event.type === "agent.response" && event.requestId === result.requestId);
    expect(response).toMatchObject({ status: "cancelled", message: "not now" });
    expect(job.agent.getState(AgentEventState).inputQueue).toHaveLength(0);
  });

  it("a cancelled run of the running input aborts it", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec());
    const controller = new AbortController();
    const pending = job.run({ from: "Queue", message: "long work" }, { signal: controller.signal });
    await waitFor(() => queuedRequest(job.agent, "long work") !== undefined);
    const requestId = queuedRequest(job.agent, "long work")!;
    makeCurrent(job.agent, requestId);
    const item = job.agent.getState(AgentEventState).currentlyExecutingInputItem!;
    controller.abort("stop");
    await pending;
    expect(item.abortController.signal.aborted).toBe(true);
  });

  it("times out: the run is cancelled and the job fails", async () => {
    const { jobs } = setup();
    const job = jobs.startJob(personSpec("slow", { limits: { timeoutSeconds: 0.05 } }));
    const result = await job.run({ from: "Queue", message: "slow work" });
    expect(result).toMatchObject({ status: "cancelled", ended: "timeout" });
    expect(job.signal.aborted).toBe(true);
    const record = await job.finish("succeeded");
    expect(record).toMatchObject({ status: "failed", error: "Timed out after 0.05 seconds" });
  });

  it("stops a job over its cost limit", async () => {
    const { jobs } = setup();
    jobs.setUsageReader(() => ({ costUsd: 2.5, tokens: 1234 }));
    const job = jobs.startJob(personSpec("pricey", { limits: { maxCostUsd: 1 } }));
    const pending = job.run({ from: "Queue", message: "spend" });
    await respondTo(job.agent, "spend", "spent");
    // The step itself succeeded; the job ended over budget after it.
    expect((await pending).status).toBe("success");
    expect(job.ended).toBe("budget");
    expect(job.signal.aborted).toBe(true);
    expect(job.record).toMatchObject({ status: "failed", costUsd: 2.5, tokens: 1234 });
    expect(job.record.error).toContain("over budget");
    expect(job.record.error).toContain("limit of $1.00");
    expect(job.record.maxCostUsd).toBe(1);
    // The job agent's own transcript says so too.
    const text = JSON.stringify(job.agent.getState(AgentEventState).events);
    expect(text).toContain("over budget");
  });

  it("applies agent.jobs.defaultMaxCostUsd when the spec sets none, and a spec's own limit wins", () => {
    const { jobs } = setup({ defaultMaxCostUsd: 3 });
    expect(jobs.startJob(personSpec("default")).record.maxCostUsd).toBe(3);
    expect(jobs.startJob(personSpec("own", { limits: { maxCostUsd: 0.5 } })).record.maxCostUsd).toBe(0.5);
    const { jobs: uncapped } = setup();
    expect(uncapped.startJob(personSpec("none")).record.maxCostUsd).toBeNull();
  });

  it("stops a job over the default budget", async () => {
    const { jobs } = setup({ defaultMaxCostUsd: 1 });
    jobs.setUsageReader(() => ({ costUsd: 2, tokens: 1 }));
    const job = jobs.startJob(personSpec("pricey"));
    const pending = job.run({ from: "Queue", message: "spend" });
    await respondTo(job.agent, "spend", "spent");
    await pending;
    expect(job.record.status).toBe("failed");
  });

  it("runOnce starts, runs and finishes", async () => {
    const { jobs, agentManager } = setup();
    const pending = jobs.runOnce(personSpec("once"), { from: "Queue", message: "once" });
    const record = jobs.list()[0]!;
    const agent = agentManager.getAgent(record.agentId!)!;
    await respondTo(agent, "once", "Result text");
    expect(await pending).toMatchObject({ status: "succeeded", summary: "Result text" });
    // Succeeded with cleanup "delete": the agent is gone.
    expect(agentManager.getAgent(record.agentId!)).toBeNull();
  });
});

describe("AgentJobService cancel and cleanup", () => {
  it("cancelling a job cancels everything under it", async () => {
    const { jobs } = setup();
    const a = jobs.startJob(personSpec("a"));
    const b = jobs.startJob(agentSpec(a.agent, "b"));
    const c = jobs.startJob(agentSpec(b.agent, "c"));
    const other = jobs.startJob(personSpec("unrelated"));
    const running = c.run({ from: "x", message: "deep work" });
    await waitFor(() => queuedRequest(c.agent, "deep work") !== undefined);

    expect(jobs.cancel(a.id, "stop everything")).toBe(true);
    expect((await running).status).toBe("cancelled");
    expect([a, b, c].map(job => job.record.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(b.signal.aborted && c.signal.aborted).toBe(true);
    expect(other.record.status).toBe("running");
    expect(jobs.cancel(a.id, "again")).toBe(false);
  });

  it("a job whose agent is stopped from outside is cancelled", () => {
    const { jobs, agentManager } = setup();
    const job = jobs.startJob(personSpec());
    agentManager.deleteAgent(job.agent.id, "closed in the UI");
    expect(job.record).toMatchObject({ status: "cancelled", error: "The job's agent was stopped" });
    expect(job.signal.aborted).toBe(true);
  });

  it("deletes the agent on success, keeps it with cleanup keep, and keeps a failed one for a while", async () => {
    const { jobs, agentManager } = setup({}, { keepFailedAgentMs: 30 });
    const ok = jobs.startJob(personSpec("ok"));
    await ok.finish("succeeded");
    expect(agentManager.getAgent(ok.agent.id)).toBeNull();

    const kept = jobs.startJob(personSpec("kept", { cleanup: "keep" }));
    await kept.finish("succeeded");
    expect(agentManager.getAgent(kept.agent.id)).not.toBeNull();

    const failed = jobs.startJob(personSpec("failed"));
    await failed.finish("failed", "it broke");
    expect(failed.record).toMatchObject({ status: "failed", error: "it broke" });
    expect(agentManager.getAgent(failed.agent.id)).not.toBeNull();
    await waitFor(() => agentManager.getAgent(failed.agent.id) === null);

    const cancelled = jobs.startJob(personSpec("cancelled"));
    jobs.cancel(cancelled.id, "no");
    expect(agentManager.getAgent(cancelled.agent.id)).not.toBeNull();
    await waitFor(() => agentManager.getAgent(cancelled.agent.id) === null);
  });

  it("stop() clears pending deletions and marks running jobs interrupted", async () => {
    const { jobs, agentManager } = setup({}, { keepFailedAgentMs: 20 });
    const failed = jobs.startJob(personSpec("failed"));
    await failed.finish("failed");
    const running = jobs.startJob(personSpec("running"));
    jobs.stop();
    await Bun.sleep(40);
    expect(agentManager.getAgent(failed.agent.id)).not.toBeNull();
    expect(running.record.status).toBe("interrupted");
    expect(() => jobs.startJob(personSpec())).toThrow("stopping");
  });
});

describe("AgentJobService runInAgent", () => {
  it("queues behind the agent's own work and cancels only its own input", async () => {
    const { jobs, starter } = setup();
    const own = starter.handleInput({ from: "person", message: "person's work" });
    await waitFor(() => queuedRequest(starter, "person's work") !== undefined);
    makeCurrent(starter, own);
    const personsItem = starter.getState(AgentEventState).currentlyExecutingInputItem!;

    const controller = new AbortController();
    const pending = jobs.runInAgent(starter, { from: "Scheduled", message: "scheduled prompt" }, { signal: controller.signal });
    await waitFor(() => queuedRequest(starter, "scheduled prompt") !== undefined);
    controller.abort("schedule stopped");
    const result = await pending;

    expect(result.status).toBe("cancelled");
    expect(personsItem.abortController.signal.aborted).toBe(false);
    expect(queuedRequest(starter, "scheduled prompt")).toBeUndefined();
    expect(queuedRequest(starter, "person's work")).toBe(own);
  });

  it("aborts its own input when that is the one running, and reports a timeout", async () => {
    const { jobs, starter } = setup();
    const pending = jobs.runInAgent(starter, { from: "Scheduled", message: "tick" }, { timeoutSeconds: 0.05 });
    await waitFor(() => queuedRequest(starter, "tick") !== undefined);
    makeCurrent(starter, queuedRequest(starter, "tick")!);
    const item = starter.getState(AgentEventState).currentlyExecutingInputItem!;
    const result = await pending;
    expect(result).toMatchObject({ status: "cancelled", message: "Timed out after 0.05 seconds" });
    expect(item.abortController.signal.aborted).toBe(true);
  });

  it("returns the response of its own input", async () => {
    const { jobs, starter } = setup();
    const pending = jobs.runInAgent(starter, { from: "Scheduled", message: "report" });
    await respondTo(starter, "report", "Report done");
    expect(await pending).toMatchObject({ status: "success", output: "Report done" });
  });
});

describe("AgentJobService records", () => {
  it("persists records, and marks jobs running at load as interrupted", async () => {
    const recordsFile = tempFile();
    const first = setup({}, { recordsFile });
    const done = first.jobs.startJob(personSpec("done"));
    await done.finish("succeeded", "ok");
    const running = first.jobs.startJob(personSpec("running"));
    await first.jobs.flush();
    // A crash: the service never stops, the file says "running".
    const saved = JSON.parse(fs.readFileSync(recordsFile, "utf8")) as { jobs: { id: string; status: string }[] };
    expect(saved.jobs.find(job => job.id === running.id)?.status).toBe("running");

    const second = setup({}, { recordsFile });
    second.jobs.load();
    expect(second.jobs.get(done.id)).toMatchObject({ status: "succeeded", summary: "ok" });
    expect(second.jobs.get(running.id)).toMatchObject({ status: "interrupted", error: "Interrupted by a restart" });
    expect(second.jobs.list().map(job => job.label)).toEqual(["running", "done"]);
    // A parentJobId may point at a loaded record.
    expect(second.jobs.startJob(personSpec("child", { parentJobId: done.id })).record.depth).toBe(2);
  });

  it("notifies subscribers of changes and of finished jobs, and finds a job by agent", async () => {
    const { jobs } = setup();
    const changes: string[] = [];
    const finished: string[] = [];
    jobs.subscribe(record => changes.push(record.status));
    jobs.onJobFinished(record => finished.push(`${record.label}:${record.status}`));
    const job = jobs.startJob(personSpec("watched"));
    expect(jobs.jobForAgent(job.agent.id)?.id).toBe(job.id);
    expect(jobs.jobOfAgentTree(job.agent)).toBe(job.id);
    await job.finish("succeeded");
    expect(changes).toEqual(["queued", "running", "succeeded"]);
    expect(finished).toEqual(["watched:succeeded"]);
    // Still found by agent after the agent is gone (no longer working for it).
    expect(jobs.jobOfAgentTree(job.agent)).toBeNull();
    expect(jobs.jobForAgent(job.agent.id)?.status).toBe("succeeded");
    expect(jobs.list({ owner: "tasks" })).toEqual([]);
    expect(jobs.list({ owner: "queue", limit: 1 })).toHaveLength(1);
  });
});
