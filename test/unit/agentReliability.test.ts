import { describe, expect, it } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import type Agent from "../../Agent.ts";
import { createAgentStateSliceStream } from "../../rpc/createAgentStateStream.ts";
import AgentCommandService from "../../services/AgentCommandService.ts";
import AgentManager from "../../services/AgentManager.ts";
import { AgentEventState } from "../../state/agentEventState.ts";
import { CommandHistoryState } from "../../state/commandHistoryState.ts";
import { runSubAgent } from "../../util/runSubAgent.ts";
import createTestingAgent from "../createTestingAgent.test.ts";

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const queued = (agent: Agent) => agent.getState(AgentEventState).inputQueue.map(item => item.request.input.message);

/** Starts running the first queued input, as the command loop would. */
function startFirst(agent: Agent) {
  agent.mutateState(AgentEventState, state => {
    const item = state.inputQueue[0]!;
    item.executionState.status = "running";
    state.currentlyExecutingInputItem = item;
  });
  return agent.getState(AgentEventState).currentlyExecutingInputItem!;
}

describe("Agent input handling", () => {
  it("queues inputs in arrival order even when an earlier input's hooks are slower", async () => {
    const app = createTestingApp() as TokenRingApp;
    const releases: (() => void)[] = [];
    app.addService(AgentLifecycleService, {
      name: "AgentLifecycleService",
      description: "",
      executeHooks: (hook: { input: { message: string } }) =>
        hook.input.message === "first" ? new Promise<never[]>(resolve => releases.push(() => resolve([]))) : Promise.resolve([]),
    } as unknown as AgentLifecycleService);
    const agent = createTestingAgent(app);

    agent.handleInput({ from: "test", message: "first" });
    agent.handleInput({ from: "test", message: "second" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(queued(agent)).toEqual([]);
    releases[0]!();
    await waitFor(() => queued(agent).length === 2);
    expect(queued(agent)).toEqual(["first", "second"]);
  });

  it("cancels an input whose hooks are still running, and records it as cancelled", async () => {
    const app = createTestingApp() as TokenRingApp;
    let release!: () => void;
    app.addService(AgentLifecycleService, {
      name: "AgentLifecycleService",
      description: "",
      executeHooks: () => new Promise<never[]>(resolve => (release = () => resolve([]))),
    } as unknown as AgentLifecycleService);
    const agent = createTestingAgent(app);

    const requestId = agent.handleInput({ from: "test", message: "never mind" });
    await waitFor(() => release !== undefined);
    expect(agent.cancelInput(requestId)).toBe(true);
    release();
    await waitFor(() => agent.getState(AgentEventState).events.some(event => event.type === "agent.response" && event.requestId === requestId));
    expect(queued(agent)).toEqual([]);
    expect(agent.cancelInput("unknown")).toBe(false);
  });

  it("refuses input once the agent has been shut down", () => {
    const agent = createTestingAgent(createTestingApp() as TokenRingApp);
    agent.app.requireService(AgentManager).deleteAgent(agent.id, "test");
    expect(() => agent.handleInput({ from: "test", message: "hello?" })).toThrow("has been shut down");
  });

  it("ignores a second answer to the same question instead of throwing", async () => {
    const agent = createTestingAgent(createTestingApp() as TokenRingApp);
    agent.answerTimeoutSeconds = null;
    agent.handleInput({ from: "test", message: "work" });
    await waitFor(() => queued(agent).length === 1);
    const item = startFirst(agent);

    const approval = agent.askForApproval({ message: "OK?" });
    const interaction = item.executionState.availableInteractions[0]!;
    const response = { requestId: item.request.requestId, interactionId: interaction.interactionId, result: ["Approved"] };
    expect(agent.sendInteractionResponse(response)).toBe(true);
    expect(await approval).toBe(true);
    expect(agent.sendInteractionResponse(response)).toBe(false);
  });

  it("rejects a cancelled question with an Error, and keeps a finished turn from turning busy work into an error", async () => {
    const agent = createTestingAgent(createTestingApp() as TokenRingApp);
    agent.answerTimeoutSeconds = null;
    agent.handleInput({ from: "test", message: "work" });
    await waitFor(() => queued(agent).length === 1);
    const item = startFirst(agent);

    const question = agent.askForText({ message: "Name?", label: "Name" });
    agent.abortCurrentOperation("User cancelled");
    const error = await question.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("User cancelled");

    let finish!: (value: string) => void;
    const busy = agent.busyWithActivity("Working", new Promise<string>(resolve => (finish = resolve)));
    agent.mutateState(AgentEventState, state => {
      state.currentlyExecutingInputItem = null;
      state.inputQueue = state.inputQueue.filter(other => other !== item);
    });
    finish("real result");
    expect(await busy).toBe("real result");
  });

  it("counts a busy agent as not idle, and measures run time from creation", async () => {
    const agent = createTestingAgent(createTestingApp() as TokenRingApp);
    agent.handleInput({ from: "test", message: "long quiet work" });
    await waitFor(() => queued(agent).length === 1);
    expect(agent.getIdleDuration()).toBe(0);
    expect(agent.getRunDuration()).toBeLessThan(1000);
  });
});

describe("getAbortSignal", () => {
  it("falls back to the agent's shutdown signal when no input is running, instead of throwing", () => {
    const app = createTestingApp() as TokenRingApp;
    const agent = createTestingAgent(app);
    const signal = agent.getAbortSignal();
    expect(signal).toBe(agent.agentShutdownSignal);
    app.requireService(AgentManager).deleteAgent(agent.id, "test");
    expect(signal.aborted).toBe(true);
  });
});

describe("checkpoints", () => {
  it("keep their events' original times, so a restored agent can be branched at an earlier point", () => {
    const app = createTestingApp() as TokenRingApp;
    const agent = createTestingAgent(app);
    agent.mutateState(AgentEventState, state => {
      state.events.push({ type: "output.chat", message: "early", timestamp: 1_000 });
      state.events.push({ type: "output.info", message: "between", timestamp: 1_200 });
      state.events.push({ type: "output.chat", message: "late", timestamp: 2_000 });
    });
    const manager = app.requireService(AgentManager);
    manager.addAgentConfigs(agent.config);
    const restored = manager.spawnAgentFromCheckpoint(agent.generateCheckpoint());
    const times = restored
      .getState(AgentEventState)
      .events.filter(event => event.type === "output.chat")
      .map(event => event.timestamp);
    expect(times).toEqual([1_000, 2_000]);

    const branch = manager.spawnAgentFromCheckpoint(restored.generateCheckpoint(1_500));
    const messages = branch.getState(AgentEventState).events.flatMap(event => (event.type === "output.chat" ? [event.message] : []));
    expect(messages).toEqual(["early"]);
    // A restored agent is not run past its maxRunTime by its old history.
    expect(restored.getRunDuration()).toBeLessThan(1000);
    expect(restored.getState(CommandHistoryState)).toBeDefined();
  });

  it("restore an agent under its old id when nothing is running with it, and copy it under a new id otherwise", () => {
    const app = createTestingApp() as TokenRingApp;
    const { config } = createTestingAgent(app);
    const manager = app.requireService(AgentManager);
    manager.addAgentConfigs(config);
    const agent = manager.spawnAgent({ agentType: config.agentType });
    const checkpoint = agent.generateCheckpoint();

    // Still running: restoring makes a copy.
    const copy = manager.spawnAgentFromCheckpoint(checkpoint);
    expect(copy.id).not.toBe(agent.id);

    manager.deleteAgent(agent.id, "test");
    const restored = manager.spawnAgentFromCheckpoint(checkpoint);
    expect(restored.id).toBe(agent.id);
    expect(manager.getAgent(agent.id)).toBe(restored);

    // A branch of a running agent is always a new agent.
    expect(manager.branchAgent(restored).id).not.toBe(agent.id);
  });

  it("put a restored sub-agent back under its parent when the parent is running", () => {
    const app = createTestingApp() as TokenRingApp;
    const { config } = createTestingAgent(app);
    const manager = app.requireService(AgentManager);
    manager.addAgentConfigs(config);
    const parent = manager.spawnAgent({ agentType: config.agentType });
    const child = manager.spawnSubAgent(parent, config.agentType);
    const checkpoint = child.generateCheckpoint();
    expect(checkpoint.parentAgentId).toBe(parent.id);

    manager.deleteAgent(child.id, "test");
    const restored = manager.spawnAgentFromCheckpoint(checkpoint);
    expect(restored.id).toBe(child.id);
    expect(restored.parentAgentId).toBe(parent.id);
    expect(manager.getChildAgents(parent.id)).toEqual([restored]);

    // A copy (the id is taken) is a top-level agent.
    expect(manager.spawnAgentFromCheckpoint(checkpoint).parentAgentId).toBeNull();

    // With the parent gone it comes back on its own.
    manager.deleteAgent(parent.id, "test");
    expect(manager.spawnAgentFromCheckpoint(checkpoint).parentAgentId).toBeNull();
  });
});

describe("runSubAgent", () => {
  it("returns instead of hanging when the child is deleted with steps still queued", async () => {
    const app = createTestingApp() as TokenRingApp;
    const parent = createTestingAgent(app);
    const manager = app.requireService(AgentManager);
    manager.addAgentConfigs(parent.config);
    parent.handleInput({ from: "test", message: "delegate" });
    await waitFor(() => queued(parent).length === 1);
    startFirst(parent);

    const run = runSubAgent({
      agentType: parent.config.agentType,
      from: "test",
      steps: ["step 1", "step 2"],
      parentAgent: parent,
      options: {
        forwardChatOutput: false,
        forwardStatusMessages: false,
        forwardSystemOutput: false,
        forwardHumanRequests: false,
        forwardReasoning: false,
        forwardInputCommands: false,
        timeout: 0,
        maxResponseLength: 1000,
        minContextLength: 100,
      },
    });
    await waitFor(() => manager.getChildAgents(parent.id).length === 1);
    const child = manager.getChildAgents(parent.id)[0]!;
    await waitFor(() => queued(child).length === 2);
    manager.deleteAgent(child.id, "closed by the user");
    expect(await run).toMatchObject({ status: "cancelled", response: expect.stringContaining("closed by the user") });
  });
});

describe("agent state streams", () => {
  it("end, saying the agent is gone, when the agent is deleted", async () => {
    const app = createTestingApp() as TokenRingApp;
    const agent = createTestingAgent(app);
    const stream = createAgentStateSliceStream({ SliceClass: CommandHistoryState, project: state => ({ count: state.commands.length }) })(
      { agentId: agent.id },
      app,
      new AbortController().signal,
    );
    expect(await stream.next()).toMatchObject({ value: { count: 0 } });
    const rest = (async () => {
      const values: unknown[] = [];
      for await (const value of { [Symbol.asyncIterator]: () => stream }) values.push(value);
      return values;
    })();
    app.requireService(AgentManager).deleteAgent(agent.id, "test");
    expect((await rest).at(-1)).toEqual({ status: "agentNotFound" });
  });
});

describe("AgentCommandService", () => {
  function setup() {
    const app = createTestingApp() as TokenRingApp;
    const service = new AgentCommandService();
    app.addService(AgentCommandService, service);
    const calls: { name: string; input: unknown }[] = [];
    const command = (name: string, inputSchema: object) => ({
      name,
      description: name,
      help: `help for ${name}`,
      inputSchema,
      execute: (input: { remainder?: string; args?: unknown }) => {
        calls.push({ name, input: { remainder: input.remainder, args: input.args } });
        return "ok";
      },
    });
    service.addAgentCommands([
      command("chat send", { args: {}, remainder: { name: "message", description: "", required: true } }),
      command("agent run", {
        args: { type: { type: "string", description: "", required: true } },
        remainder: { name: "message", description: "", required: true },
      }),
      command("help", {}),
    ] as never);
    const agent = createTestingAgent(app);
    agent.mutateState(AgentEventState, state => {
      state.inputQueue.push({
        request: { type: "input.received", requestId: "r", timestamp: 0, input: { from: "t", message: "" } },
        executionState: { status: "running", currentActivity: "", availableInteractions: [] },
        interactionCallbacks: new Map(),
        abortController: new AbortController(),
      });
      state.currentlyExecutingInputItem = state.inputQueue[0]!;
    });
    return { service, agent, calls, manager: app.requireService(AgentManager) };
  }

  it("sends a message starting with @ to the chat like any other, unchanged", async () => {
    const { service, agent, calls } = setup();
    const message = "@explore where is auth?\n- check src/";
    await service.executeAgentCommand(agent, message);
    expect(calls[0]).toEqual({ name: "chat send", input: { remainder: message, args: {} } });
  });

  it("matches a command followed by a line break or extra spaces, and keeps the message intact", async () => {
    const { service, agent, calls } = setup();
    await service.executeAgentCommand(agent, '/chat send\nLine "one"\n  C:\\path');
    await service.executeAgentCommand(agent, "/chat   send  spaced");
    expect(calls.map(call => (call.input as { remainder: string }).remainder)).toEqual(['Line "one"\n  C:\\path', "spaced"]);
    expect(await service.executeAgentCommand(agent, "/help  agent   run")).toEqual({ message: "help for agent run" });
  });

  it("refuses a configured command that would replace a built-in", () => {
    const { service, manager } = setup();
    manager.addAgentConfigs({ ...createTestingAgent(createTestingApp() as TokenRingApp).config });
    expect(() => service.reconfigure({ help: { agentType: "mock-agent", description: "x", steps: ["x"] } as never }, manager)).toThrow(
      "/help is a built-in command",
    );
  });
});

describe("AgentManager idle clean-up", () => {
  it("keeps an idle agent its type needs for minimumRunning", () => {
    const app = createTestingApp() as TokenRingApp;
    const agent = createTestingAgent(app);
    const manager = app.requireService(AgentManager);
    manager.addAgentConfigs({ ...agent.config, idleTimeout: 1, minimumRunning: 1 });
    Object.assign(agent.config, { idleTimeout: 1 });
    (agent as { createdAt: number }).createdAt = Date.now() - 10_000;
    (manager as unknown as { checkAndDeleteIdleAgents(): void }).checkAndDeleteIdleAgents();
    expect(manager.getAgent(agent.id)).not.toBeNull();
  });
});
