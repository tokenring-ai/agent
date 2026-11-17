import { describe, expect, it } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import agentRpc from "../../rpc/agent.ts";
import { AgentConfigSchema } from "../../schema.ts";
import AgentManager from "../../services/AgentManager.ts";

const mockConfig = AgentConfigSchema.parse({
  agentType: "test",
  displayName: "Test Agent",
  description: "A test agent",
  category: "test",
  debug: false,
  initialCommands: [],
  createMessage: "foo",
  callable: true,
  idleTimeout: 86400,
  maxRunTime: 1800,
  minimumRunning: 0,
});

type StreamChunk = { status: "agentNotFound" } | { status: "success"; events: unknown[]; position: number };

function streamAgentEventsExecute(_app: TokenRingApp) {
  const execute = agentRpc.methods.streamAgentEvents?.execute;
  if (!execute) throw new Error("streamAgentEvents method not registered");
  return execute as (args: { agentId: string; fromPosition: number }, app: TokenRingApp, signal: AbortSignal) => AsyncGenerator<StreamChunk>;
}

/** Resolves a generator step, failing the test instead of hanging if the stream goes silent. */
async function nextOrTimeout(stream: AsyncGenerator<StreamChunk>, ms = 2000): Promise<IteratorResult<StreamChunk>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("streamAgentEvents never terminated — is the shutdown signal wired?")), ms);
  });
  try {
    return await Promise.race([stream.next(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

describe("streamAgentEvents RPC", () => {
  it("yields agentNotFound immediately for an unknown agent", async () => {
    const app = createTestingApp();
    const manager = new AgentManager(app);
    app.addService(AgentManager, manager);
    manager.addAgentConfigs(mockConfig);

    const controller = new AbortController();
    const stream = streamAgentEventsExecute(app)({ agentId: "no-such-agent", fromPosition: 0 }, app, controller.signal);
    const first = await nextOrTimeout(stream);
    expect(first.value).toEqual({ status: "agentNotFound" });
    controller.abort();
  });

  it("yields state to a subscriber and ends on client abort", async () => {
    const app = createTestingApp();
    const manager = new AgentManager(app);
    app.addService(AgentManager, manager);
    manager.addAgentConfigs(mockConfig);
    const agent = manager.spawnAgent({ agentType: "test" });

    const controller = new AbortController();
    const stream = streamAgentEventsExecute(app)({ agentId: agent.id, fromPosition: 0 }, app, controller.signal);
    const first = await nextOrTimeout(stream);
    expect(first.done).toBe(false);
    controller.abort();
    const done = await nextOrTimeout(stream);
    expect(done.done).toBe(true);
  });

  it("ends the stream when the agent is deleted while subscribed", async () => {
    const app = createTestingApp();
    const manager = new AgentManager(app);
    app.addService(AgentManager, manager);
    manager.addAgentConfigs(mockConfig);
    const agent = manager.spawnAgent({ agentType: "test" });

    // The client signal never aborts — only the agent going away can end the stream.
    const controller = new AbortController();
    const stream = streamAgentEventsExecute(app)({ agentId: agent.id, fromPosition: 0 }, app, controller.signal);
    await nextOrTimeout(stream);

    const deleted = manager.deleteAgent(agent.id, "test teardown");
    expect(deleted).toBe(true);

    const afterDelete = await nextOrTimeout(stream);
    expect(afterDelete.done).toBe(true);
    controller.abort();
  });
});
