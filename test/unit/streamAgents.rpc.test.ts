import { describe, expect, it } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import type { z } from "zod";
import agentRpc from "../../rpc/agent.ts";
import type { AgentListEntrySchema } from "../../rpc/schema.ts";
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
  headless: true,
  callable: true,
  idleTimeout: 86400,
  maxRunTime: 1800,
  minimumRunning: 0,
});

describe("streamAgents RPC", () => {
  it("streams agent list updates", async () => {
    const app = createTestingApp();
    const manager = new AgentManager(app);
    app.addService(manager);
    manager.addAgentConfigs(mockConfig);

    const controller = new AbortController();
    const streamAgentsExecute = agentRpc.methods.streamAgents?.execute;
    if (!streamAgentsExecute) throw new Error("streamAgents method not registered");

    const streamAgents = streamAgentsExecute as (
      args: Record<string, never>,
      app: TokenRingApp,
      signal: AbortSignal,
    ) => AsyncGenerator<z.infer<typeof AgentListEntrySchema>[]>;
    const stream = streamAgents({}, app, controller.signal);

    const first = await stream.next();
    expect(first.value).toEqual([]);

    const agent = manager.spawnAgent({ agentType: "test", headless: true });
    const second = await stream.next();
    expect(second.value).toEqual([
      expect.objectContaining({
        id: agent.id,
        agentType: "test",
        displayName: "Test Agent",
      }),
    ]);

    controller.abort();
    const done = await stream.next();
    expect(done.done).toBe(true);
  });
});
