import { afterEach, beforeEach, describe, expect, it, jest, mock, spyOn } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { z } from "zod";
import Agent from "../../Agent.ts";
import { AgentConfigSchema, type ParsedAgentConfig } from "../../schema";
import AgentManager from "../../services/AgentManager.ts";
import { AgentStateSlice } from "../../types.ts";
import createTestingAgent from "../createTestingAgent.test";

const app = createTestingApp();

// Create a mock agent
const createMockAgent = () => {
  const agent = createTestingAgent(app);
  spyOn(agent, "requireService");
  spyOn(agent, "chatOutput");
  spyOn(agent, "infoMessage");
  spyOn(agent, "errorMessage");

  return agent;
};

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

describe("AgentManager", () => {
  let app: TokenRingApp;
  let manager: AgentManager;

  beforeEach(() => {
    mock.clearAllMocks();

    app = createTestingApp();
    manager = new AgentManager(app);
    app.addService(AgentManager, manager);

    // Add test configurations
    manager.addAgentConfigs(mockConfig);
    manager.addAgentConfigs({
      ...mockConfig,
      agentType: "background",
      displayName: "Background Agent",
    });
  });

  afterEach(() => {
    for (const agent of manager.getAgents()) {
      manager.deleteAgent(agent.id, "test cleanup");
    }
    mock.clearAllMocks();
  });

  describe("Service Properties", () => {
    it("should have correct name and description", () => {
      expect(manager.name).toBe("AgentManager");
      expect(manager.description).toBe("A service which manages agent configurations and spawns agents.");
    });
  });

  describe("Configuration Management", () => {
    it("should add single agent config", () => {
      const testConfig: ParsedAgentConfig = {
        ...mockConfig,
        agentType: "new",
        displayName: "New Agent",
      };

      manager.addAgentConfigs(testConfig);

      const entries = Array.from(manager.getAgentConfigEntries());
      expect(entries).toEqual(expect.arrayContaining([expect.arrayContaining(["new"])]));
    });

    it("should add multiple agent configs", () => {
      manager.addAgentConfigs({ ...mockConfig, agentType: "config1", displayName: "Agent 1" }, { ...mockConfig, agentType: "config2", displayName: "Agent 2" });

      const entries = Array.from(manager.getAgentConfigEntries());
      expect(entries).toEqual(expect.arrayContaining([expect.arrayContaining(["config1"]), expect.arrayContaining(["config2"])]));
    });

    it("should get all agent types", () => {
      const types = manager.getAgentTypes();
      expect(types).toContain("test");
      expect(types).toContain("background");
    });

    it("should get agent config entries", () => {
      const entries = Array.from(manager.getAgentConfigEntries());
      expect(entries).toEqual(expect.arrayContaining([expect.arrayContaining(["test"]), expect.arrayContaining(["background"])]));
    });

    it("should get agent types like pattern", () => {
      const entries = manager.getAgentTypesLike("te*");
      expect(entries[0]?.[0]).toEqual("test");
    });

    it("should report where each agent type came from", () => {
      manager.setWorkspaceAgentConfigs({ authored: { ...mockConfig, displayName: "Authored" } });

      expect(manager.getAgentSource("test")).toBe("bundled");
      expect(manager.getAgentSource("authored")).toBe("workspace");
      expect(manager.getAgentSource("nope")).toBeUndefined();
    });

    it("should keep workspace agents when the config is reconciled without them", () => {
      manager.setWorkspaceAgentConfigs({ authored: { ...mockConfig, displayName: "Authored" } });

      // Reconfigure passes the whole config-defined set; workspace agents are not part of it.
      manager.reconfigure({ test: { ...mockConfig, displayName: "Test Agent" } });

      expect(manager.getAgentTypes()).toContain("authored");
      // ...and it still drops bundled types that the config no longer defines.
      expect(manager.getAgentTypes()).not.toContain("background");
    });

    it("should let a workspace agent shadow a bundled one of the same name", () => {
      manager.setWorkspaceAgentConfigs({ test: { ...mockConfig, displayName: "Overridden" } });

      expect(manager.getAgentConfig("test")?.displayName).toBe("Overridden");
      expect(manager.getAgentSource("test")).toBe("workspace");
      // The merged list has one entry per type, not one per source.
      expect(manager.getAgentTypes().filter(type => type === "test")).toHaveLength(1);
    });

    it("should remove workspace agents that are no longer in the directory", () => {
      manager.setWorkspaceAgentConfigs({ authored: { ...mockConfig, displayName: "Authored" } });
      manager.setWorkspaceAgentConfigs({});

      expect(manager.getAgentTypes()).not.toContain("authored");
      // Bundled types are left alone by a workspace sync.
      expect(manager.getAgentTypes()).toContain("test");
    });
  });

  describe("Agent Creation", () => {
    it("should spawn agent from config", async () => {
      const agent = manager.spawnAgentFromConfig(mockConfig);

      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.displayName).toBe(mockConfig.displayName);
    });

    it("should spawn agent by type", async () => {
      const agent = manager.spawnAgent({ agentType: "test" });

      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.displayName).toBe("Test Agent");
    });

    it("should spawn agent from checkpoint", async () => {
      const checkpoint = {
        agentId: "test-agent-id",
        createdAt: Date.now(),
        agentType: "test",
        sessionId: "test-session",
        state: {},
      };

      const agent = manager.spawnAgentFromCheckpoint(checkpoint);

      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.agentType).toBe("test");
    });
  });

  describe("Sub-Agent Management", () => {
    it("should spawn sub-agent", async () => {
      const mockAgent = createMockAgent();
      const subAgent = manager.spawnSubAgent(mockAgent, "background", {});

      expect(subAgent).toBeInstanceOf(Agent);
      expect(subAgent.config.agentType).toBe("background");
    });

    it("should transfer state from parent to sub-agent", async () => {
      const transferStateFromParent = mock();

      const testStateSchema = z.object({});

      class TestState extends AgentStateSlice<typeof testStateSchema> {
        constructor() {
          super("TestState", testStateSchema);
        }

        show() {
          return "";
        }

        serialize() {
          return {};
        }

        deserialize() {}

        transferStateFromParent = transferStateFromParent;
      }

      const mockAgent = createMockAgent();
      class TestStateService {
        name = "TestStateService";
        description = "Registers a test state slice";
        attach(agent: Agent) {
          agent.initializeState(TestState, {});
        }
      }
      app.addService(TestStateService, new TestStateService());

      manager.spawnSubAgent(mockAgent, "test", {});

      expect(transferStateFromParent).toHaveBeenCalledWith(mockAgent);
    });
  });

  describe("Agent Storage and Retrieval", () => {
    it("should store and retrieve agents", async () => {
      const agent = manager.spawnAgent({ agentType: "test" });

      const retrievedAgent = manager.getAgent(agent.id);
      expect(retrievedAgent).toBe(agent);
    });

    it("should return null for non-existent agent", () => {
      const result = manager.getAgent("non-existent-id");
      expect(result).toBeNull();
    });

    it("should get all agents", async () => {
      manager.spawnAgent({ agentType: "test" });
      manager.spawnAgent({ agentType: "background" });

      const agents = manager.getAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0]).toBeInstanceOf(Agent);
    });
  });

  describe("Agent Deletion", () => {
    it("should delete agent correctly", async () => {
      const agent = manager.spawnAgent({ agentType: "test" });

      manager.deleteAgent(agent.id, "AgentManager initiated shutdown");

      expect(manager.getAgent(agent.id)).toBeNull();
    });
  });

  describe("Idle Agent Cleanup", () => {
    beforeEach(() => {
      // Mock Date.now to control time
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      for (const agent of manager.getAgents()) {
        manager.deleteAgent(agent.id, "test cleanup");
      }
    });

    it("should delete idle agents exceeding timeout", async () => {
      // Create agent with short timeout
      const shortTimeoutConfig = AgentConfigSchema.parse({
        ...mockConfig,
        agentType: "short",
        displayName: "Short Timeout Agent",
        idleTimeout: 1, // 1 second
      });
      manager.addAgentConfigs(shortTimeoutConfig);

      const agent = manager.spawnAgent({ agentType: "short" });

      // Mock agent to be idle
      spyOn(agent, "getIdleDuration").mockReturnValue(2000); // 2 seconds > 1 second timeout

      spyOn(app, "serviceOutput");

      // Trigger cleanup
      // @ts-expect-error accessing private method for testing
      manager.checkAndDeleteIdleAgents();

      expect(app.serviceOutput).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("Agent"));
    });

    it("should not delete active agents", async () => {
      const agent = manager.spawnAgent({ agentType: "test" });

      // Mock agent to be active (idle duration < timeout)
      spyOn(agent, "getIdleDuration").mockReturnValue(1000); // 1 second < 86400 second timeout

      // Trigger cleanup
      // @ts-expect-error accessing private method for testing
      manager.checkAndDeleteIdleAgents();

      expect(manager.getAgent(agent.id)).toBe(agent);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing agent type", () => {
      expect(() =>
        manager.spawnAgent({
          agentType: "non-existent",
        }),
      ).toThrow("Item non-existent not found");
    });

    it("should handle missing agent config", () => {
      expect(() =>
        manager.spawnAgentFromCheckpoint({
          agentId: "test",
          createdAt: Date.now(),
          agentType: "non-existent",
          sessionId: "test",
          state: {},
        }),
      ).toThrow("Item non-existent not found");
    });
  });

  describe("Minimum Running Agents", () => {
    it("should spawn minimum number of agents", async () => {
      const minRunningConfig = AgentConfigSchema.parse({
        ...mockConfig,
        agentType: "min-test",
        displayName: "Min Running Agent",
        minimumRunning: 2,
      });
      manager.addAgentConfigs(minRunningConfig);

      // Trigger cleanup which should check minimum running
      // @ts-expect-error accessing private method for testing
      manager.checkAndDeleteIdleAgents();

      // Wait a bit for async agent spawning
      await new Promise(resolve => setTimeout(resolve, 10));

      const agents = manager.getAgents().filter(a => a.config.agentType === "min-test");
      expect(agents.length).toBeGreaterThanOrEqual(2);
    });
  });
});
