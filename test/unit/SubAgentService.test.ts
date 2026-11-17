import { afterEach, describe, expect, it } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import type Agent from "../../Agent.ts";
import AgentManager from "../../services/AgentManager.ts";
import SubAgentService, { type SubAgentCheckpointSource } from "../../services/SubAgentService.ts";
import { AgentEventState } from "../../state/agentEventState.ts";
import { MAX_REMEMBERED_SUB_AGENTS, SubAgentState } from "../../state/subAgentState.ts";
import createTestingAgent from "../createTestingAgent.test.ts";

const created: Agent[] = [];

afterEach(() => {
  for (const agent of created.splice(0)) agent.app.getService(AgentManager)?.deleteAgent(agent.id, "test done");
});

function setup() {
  const app = createTestingApp() as TokenRingApp;
  const parent = createTestingAgent(app);
  created.push(parent);
  const agentManager = app.requireService(AgentManager);
  agentManager.addAgentConfigs(parent.config);
  const service = new SubAgentService(app);
  // Normally the app calls detach on every service when an agent is deleted.
  const deleteAgent = agentManager.deleteAgent.bind(agentManager);
  agentManager.deleteAgent = (agentId: string, reason: string) => {
    const agent = agentManager.getAgent(agentId);
    const deleted = deleteAgent(agentId, reason);
    if (agent) service.detach(agent);
    return deleted;
  };
  return { app, parent, agentManager, service };
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** Plays the agent loop for one queued request: output, then the response. */
async function respond(agent: Agent, requestId: string, text: string, status: "success" | "error" = "success") {
  await waitFor(() => agent.getState(AgentEventState).inputQueue.some(item => item.request.requestId === requestId));
  agent.mutateState(AgentEventState, state => {
    state.currentlyExecutingInputItem = state.inputQueue.find(item => item.request.requestId === requestId) ?? null;
    state.emit({ type: "output.chat", message: text, timestamp: Date.now() });
    state.emit({ type: "agent.response", requestId, status, message: text, timestamp: Date.now() });
    state.emit({ type: "input.execution", requestId, status: "finished", timestamp: Date.now() });
  });
}

function inputsTo(agent: Agent): string[] {
  return agent
    .getState(AgentEventState)
    .events.filter(event => event.type === "input.received")
    .map(event => event.input.message);
}

describe("SubAgentService", () => {
  it("runs a child in the background, lists it under its parent, and wakes the idle parent with its reply", async () => {
    const { parent, agentManager, service } = setup();
    const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["Find the auth code"] });
    expect(record.name).toBe("mock-agent-1");

    const child = agentManager.getAgent(record.agentId)!;
    expect(child.parentAgentId).toBe(parent.id);
    expect(agentManager.getChildAgents(parent.id).map(agent => agent.id)).toEqual([child.id]);
    await waitFor(() => inputsTo(child).length === 1);
    expect(inputsTo(child)).toEqual(["Find the auth code"]);

    await respond(child, record.finalRequestId, "It is in src/auth.ts");
    await waitFor(() => inputsTo(parent).length === 1);
    expect(inputsTo(parent)[0]).toContain("### mock-agent-1 (Mock Agent) finished");
    expect(inputsTo(parent)[0]).toContain("It is in src/auth.ts");
    expect(service.listSubAgents(parent)).toMatchObject([{ name: "mock-agent-1", status: "idle", reply: null }]);
  });

  it("waits for a busy parent, and sends nothing when the parent read the reply itself", async () => {
    const { parent, agentManager, service } = setup();
    const busy = parent.handleInput({ from: "user", message: "work" });
    await waitFor(() => !parent.getState(AgentEventState).idle);

    const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["one"], name: "helper" });
    const child = agentManager.getAgent(record.agentId)!;

    const read = service.readSubAgent(parent, "helper", { waitSeconds: 5 });
    await respond(child, record.finalRequestId, "done one");
    expect(await read).toMatchObject({ status: "idle", reply: "done one" });

    await respond(parent, busy, "parent finished");
    await new Promise(resolve => setTimeout(resolve, 800));
    expect(inputsTo(parent)).toEqual(["work"]);
  });

  it("reports several children finishing together in one message", async () => {
    const { parent, agentManager, service } = setup();
    const a = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["a"], name: "a" });
    const b = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["b"], name: "b" });
    await respond(agentManager.getAgent(a.agentId)!, a.finalRequestId, "result a");
    await respond(agentManager.getAgent(b.agentId)!, b.finalRequestId, "result b", "error");
    await waitFor(() => inputsTo(parent).length === 1);
    expect(inputsTo(parent)[0]).toContain("### a (Mock Agent) finished");
    expect(inputsTo(parent)[0]).toContain("### b (Mock Agent) failed");
  });

  it("follow-ups count as finished on their own reply, and multi-message starts on the last one", async () => {
    const { parent, agentManager, service } = setup();
    const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["step 1", "step 2"], name: "steps", notify: false });
    const child = agentManager.getAgent(record.agentId)!;
    await waitFor(() => child.getState(AgentEventState).inputQueue.length === 2);
    await respond(child, child.getState(AgentEventState).inputQueue[0]!.request.requestId, "partial");
    expect(record.status).toBe("working");
    await respond(child, record.finalRequestId, "all steps done");
    expect(record.status).toBe("idle");

    await service.sendToSubAgent(parent, "steps", "and another");
    expect(record.status).toBe("working");
    await respond(child, record.finalRequestId, "another done");
    expect(await service.readSubAgent(parent, "steps")).toMatchObject({ reply: "another done" });
    // notify: false never wakes the parent.
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(inputsTo(parent)).toEqual([]);
  });

  it("stops children with their parent, reports a child stopped by someone else, and not one the parent stopped", async () => {
    const { parent, agentManager, service } = setup();
    const kept = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["x"], name: "kept" });
    const stopped = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["y"], name: "stopped" });

    expect(service.stopSubAgent(parent, "stopped")).toBe(true);
    expect(service.stopSubAgent(parent, "stopped")).toBe(false);
    expect(agentManager.getAgent(stopped.agentId)).toBeNull();

    agentManager.deleteAgent(kept.agentId, "closed by the user");
    await waitFor(() => inputsTo(parent).length === 1);
    expect(inputsTo(parent)[0]).toContain("### kept (Mock Agent) was stopped");
    expect(inputsTo(parent)[0]).not.toContain("### stopped");

    const orphan = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["z"] });
    agentManager.deleteAgent(parent.id, "done");
    expect(agentManager.getAgent(orphan.agentId)).toBeNull();
    expect(service.getRecord(orphan.agentId)).toBeUndefined();
  });

  it("refuses unknown types, duplicate names, and nesting too deep", () => {
    const { parent, agentManager, service } = setup();
    expect(() => service.startSubAgent(parent, { agentType: "nope", messages: ["x"] })).toThrow('There is no agent type "nope"');
    service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["x"], name: "dup" });
    expect(() => service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["x"], name: "dup" })).toThrow("already have");

    let current = parent;
    for (let depth = 1; depth <= 3; depth++) {
      const record = service.startSubAgent(current, { agentType: parent.config.agentType, messages: ["x"] });
      current = agentManager.getAgent(record.agentId)!;
    }
    expect(() => service.startSubAgent(current, { agentType: parent.config.agentType, messages: ["x"] })).toThrow("nested 3 deep");
    expect(agentManager.getRootAgent(current).id).toBe(parent.id);
  });

  it("tells the parent's chat when a child needs a person to answer", async () => {
    const { parent, agentManager, service } = setup();
    const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["x"], name: "asker" });
    const child = agentManager.getAgent(record.agentId)!;
    child.answerTimeoutSeconds = null;
    await waitFor(() => child.getState(AgentEventState).inputQueue.length === 1);
    child.mutateState(AgentEventState, state => {
      state.currentlyExecutingInputItem = state.inputQueue[0] ?? null;
    });
    void child.askForApproval({ message: "Delete the build folder?" }).catch(() => {});
    await waitFor(() =>
      parent
        .getState(AgentEventState)
        .events.some(event => event.type === "output.info" && event.message.includes("asker") && event.message.includes("Delete the build folder?")),
    );
    expect((await service.readSubAgent(parent, "asker")).waitingFor).toBe("Delete the build folder?");
  });

  describe("resuming a closed sub-agent", () => {
    it("brings a stopped sub-agent back from its last state when the parent sends it a message", async () => {
      const { parent, agentManager, service } = setup();
      const first = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["remember 42"], name: "memo", notify: false });
      const firstChild = agentManager.getAgent(first.agentId)!;
      await respond(firstChild, first.finalRequestId, "noted 42");
      expect(service.stopSubAgent(parent, "memo")).toBe(true);
      expect(service.listSubAgents(parent)).toMatchObject([{ name: "memo", status: "closed" }]);
      expect(await service.readSubAgent(parent, "memo")).toMatchObject({ status: "closed" });

      const { record } = await service.sendToSubAgent(parent, "memo", "what was the number?");
      // It comes back as the same agent: same id, same chat link.
      expect(record.agentId).toBe(first.agentId);
      const resumed = agentManager.getAgent(record.agentId)!;
      expect(resumed.parentAgentId).toBe(parent.id);
      // The old conversation came back with it.
      await waitFor(() => inputsTo(resumed).length === 2);
      expect(inputsTo(resumed)).toEqual(["remember 42", "what was the number?"]);
      expect(parent.getState(SubAgentState).subAgents).toMatchObject([{ name: "memo", agentId: record.agentId }]);

      await respond(resumed, record.finalRequestId, "42");
      expect(await service.readSubAgent(parent, "memo")).toMatchObject({ status: "idle", reply: "42" });
    });

    it("resumes from the checkpoint store after the parent itself was restored", async () => {
      const { parent, agentManager, service } = setup();
      service.attach(parent);
      const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["hello"], name: "keeper", notify: false });
      const child = agentManager.getAgent(record.agentId)!;
      await respond(child, record.finalRequestId, "hi");
      const saved = child.generateCheckpoint();
      const parentCheckpoint = parent.generateCheckpoint();

      // As after a restart: nothing in memory, only what was saved.
      const fresh = new SubAgentService(parent.app);
      const lookups: string[] = [];
      const source: SubAgentCheckpointSource = {
        latestCheckpoint: async agentId => {
          lookups.push(agentId);
          return agentId === saved.agentId ? saved : null;
        },
      };
      fresh.setCheckpointSource(source);
      const restoredParent = agentManager.spawnAgentFromCheckpoint(parentCheckpoint);
      created.push(restoredParent);
      fresh.attach(restoredParent);

      expect(fresh.listSubAgents(restoredParent)).toMatchObject([{ name: "keeper", status: "closed" }]);
      const [first, second] = await Promise.all([
        fresh.sendToSubAgent(restoredParent, "keeper", "again"),
        fresh.sendToSubAgent(restoredParent, "keeper", "and again"),
      ]);
      // Two messages at once resume it once.
      expect(first.record.agentId).toBe(second.record.agentId);
      expect(lookups).toEqual([saved.agentId]);
      const resumed = agentManager.getAgent(first.record.agentId)!;
      await waitFor(() => inputsTo(resumed).length === 3);
      expect(inputsTo(resumed)).toEqual(["hello", "again", "and again"]);
    });

    it("picks up a sub-agent that is already running again under its parent instead of starting a copy", async () => {
      const { parent, agentManager, service } = setup();
      service.attach(parent);
      const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["hello"], name: "keeper", notify: false });
      const child = agentManager.getAgent(record.agentId)!;
      await respond(child, record.finalRequestId, "hi");

      // As after the app was restored: the child is running, but this service has never seen it.
      const fresh = new SubAgentService(parent.app);
      const { record: picked } = await fresh.sendToSubAgent(parent, "keeper", "again");
      expect(picked.agentId).toBe(child.id);
      expect(agentManager.getChildAgents(parent.id)).toEqual([child]);
      await waitFor(() => inputsTo(child).length === 2);
    });

    it("says so when there is nothing to resume from", async () => {
      const { parent, service } = setup();
      service.attach(parent);
      parent.mutateState(SubAgentState, state =>
        state.remember({ name: "ghost", agentType: parent.config.agentType, displayName: "Ghost", agentId: "gone", notify: true, createdAt: 0 }),
      );
      await expect(service.sendToSubAgent(parent, "ghost", "hi")).rejects.toThrow("no saved checkpoint");
    });
  });

  it("hands back a finished reply even if a person shut the sub-agent down before the parent read it", async () => {
    const { parent, agentManager, service } = setup();
    const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["work"], name: "w", notify: false });
    await respond(agentManager.getAgent(record.agentId)!, record.finalRequestId, "the answer is 42");
    // Shut down from outside (the UI), not by the parent.
    agentManager.deleteAgent(record.agentId, "closed by a person");

    const sent = await service.sendToSubAgent(parent, "w", "and then?");
    expect(sent.unreadReply).toBe("the answer is 42");
  });

  it("does not start a resumed sub-agent for a parent that stopped while its checkpoint loaded", async () => {
    const { parent, agentManager, service } = setup();
    service.attach(parent);
    const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["hi"], name: "late", notify: false });
    const child = agentManager.getAgent(record.agentId)!;
    await respond(child, record.finalRequestId, "hello");
    const saved = child.generateCheckpoint();
    service.stopSubAgent(parent, "late");

    // No in-memory snapshot (as after a restart), and a slow checkpoint store.
    const fresh = new SubAgentService(parent.app);
    let release = () => {};
    fresh.setCheckpointSource({ latestCheckpoint: () => new Promise(resolve => (release = () => resolve(saved))) });
    const resuming = fresh.sendToSubAgent(parent, "late", "again");
    await waitFor(() => release.toString() !== "() => {}");
    agentManager.deleteAgent(parent.id, "parent stopped");
    release();

    await expect(resuming).rejects.toThrow("its parent agent has stopped");
    expect(agentManager.getAgent(saved.agentId)).toBeNull();
  });

  it("hands back a reply the parent had not read when it sends a follow-up", async () => {
    const { parent, agentManager, service } = setup();
    const record = service.startSubAgent(parent, { agentType: parent.config.agentType, messages: ["a"], name: "q", notify: false });
    await respond(agentManager.getAgent(record.agentId)!, record.finalRequestId, "answer a");
    const sent = await service.sendToSubAgent(parent, "q", "b");
    expect(sent.unreadReply).toBe("answer a");
  });
});

describe("SubAgentState.remember", () => {
  it("forgets the oldest sub-agents past the limit, but never one still running", () => {
    const state = new SubAgentState();
    const entry = (name: string) => ({ name, agentType: "t", displayName: "T", agentId: name, notify: true, createdAt: 0 });
    state.remember(entry("still-working"));
    for (let i = 0; i < MAX_REMEMBERED_SUB_AGENTS + 5; i++) state.remember(entry(`done-${i}`), new Set(["still-working"]));

    const names = state.subAgents.map(e => e.name);
    expect(names).toHaveLength(MAX_REMEMBERED_SUB_AGENTS);
    expect(names).toContain("still-working");
    expect(names).not.toContain("done-0");
  });
});
