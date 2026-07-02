import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import { describe, expect, it } from "vitest";
import { AgentConfigSchema } from "../../schema.ts";
import AgentManager from "../../services/AgentManager.ts";
import agentRpc from "../../rpc/agent.ts";

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
    app.addServices(manager);
    manager.addAgentConfigs(mockConfig);

    const controller = new AbortController();
    const stream = agentRpc.methods.streamAgents.execute({}, app, controller.signal);

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