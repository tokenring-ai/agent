import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentConfigSchema } from "../../schema.ts";
import AgentManager from "../../services/AgentManager.ts";
import { AgentEventState } from "../../state/agentEventState.ts";

const mockConfig = AgentConfigSchema.parse({
  agentType: "test",
  displayName: "Test Agent",
  description: "A test agent",
  category: "test",
  debug: false,
  initialCommands: [],
  createMessage: "foo",
  headless: true,
  callable: true,
  idleTimeout: 86400,
  maxRunTime: 1800,
  minimumRunning: 0,
});

async function collectUntil<T>(generator: AsyncGenerator<T>, predicate: (value: T) => boolean, limit = 10): Promise<T[]> {
  const values: T[] = [];
  for await (const value of generator) {
    values.push(value);
    if (predicate(value) || values.length >= limit) {
      break;
    }
  }
  return values;
}

describe("AgentManager.subscribeAgentsAsync", () => {
  let manager: AgentManager;

  beforeEach(() => {
    const app = createTestingApp();
    manager = new AgentManager(app);
    app.addServices(manager);
    manager.addAgentConfigs(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yields the current agent list immediately", async () => {
    const agent = manager.spawnAgent({ agentType: "test", headless: true });
    const controller = new AbortController();

    const snapshots = await collectUntil(manager.subscribeAgentsAsync(controller.signal), () => true, 1);

    expect(snapshots[0]).toEqual([
      expect.objectContaining({
        id: agent.id,
        displayName: "Test Agent",
        idle: true,
      }),
    ]);

    controller.abort();
  });

  it("emits when a new agent is spawned", async () => {
    const controller = new AbortController();
    const iterator = manager.subscribeAgentsAsync(controller.signal);
    const first = await iterator.next();

    expect(first.value).toEqual([]);

    const agent = manager.spawnAgent({ agentType: "test", headless: true });
    const second = await iterator.next();

    expect(second.value).toEqual([
      expect.objectContaining({
        id: agent.id,
      }),
    ]);

    controller.abort();
    await iterator.return(undefined);
  });

  it("emits when an agent is deleted", async () => {
    const agent = manager.spawnAgent({ agentType: "test", headless: true });
    const controller = new AbortController();
    const iterator = manager.subscribeAgentsAsync(controller.signal);
    await iterator.next();

    manager.deleteAgent(agent.id, "test delete");
    const next = await iterator.next();

    expect(next.value).toEqual([]);
    controller.abort();
    await iterator.return(undefined);
  });

  it("emits when agent activity changes", async () => {
    const agent = manager.spawnAgent({ agentType: "test", headless: true });
    const controller = new AbortController();
    const iterator = manager.subscribeAgentsAsync(controller.signal);
    await iterator.next();

    agent.mutateState(AgentEventState, state => {
      state.currentActivity = "Working on task";
      state.pushAgentStatus();
    });

    const next = await iterator.next();
    expect(next.value?.[0]).toMatchObject({
      id: agent.id,
      currentActivity: "Working on task",
    });

    controller.abort();
    await iterator.return(undefined);
  });

  it("stops yielding after abort", async () => {
    const managerGenerator = manager.subscribeAgentsAsync(new AbortController().signal);
    await managerGenerator.next();

    const abortController = new AbortController();
    const iterator = manager.subscribeAgentsAsync(abortController.signal);
    await iterator.next();

    abortController.abort();
    const result = await iterator.next();
    expect(result.done).toBe(true);
  });
});