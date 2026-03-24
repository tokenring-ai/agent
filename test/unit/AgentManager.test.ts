import TokenRingApp from '@tokenring-ai/app';
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Agent from '../../Agent.ts';
import {AgentConfigSchema, type ParsedAgentConfig} from "../../schema";
import AgentManager from '../../services/AgentManager.ts';
import createTestingAgent from "../createTestingAgent";

const app = createTestingApp();

// Create a mock agent
const createMockAgent = () => {
  const agent = createTestingAgent(app);
  vi.spyOn(agent, 'requireServiceByType');
  vi.spyOn(agent, 'chatOutput');
  vi.spyOn(agent, 'infoMessage');
  vi.spyOn(agent, 'errorMessage');

  return agent;
};

const mockConfig = AgentConfigSchema.parse({
  agentType: 'test',
  displayName: 'Test Agent',
  description: 'A test agent',
  category: 'test',
  debug: false,
  initialCommands: [],
  createMessage: "foo",
  headless: true,
  callable: true,
  idleTimeout: 86400,
  maxRunTime: 1800,
  minimumRunning: 0,
});

describe('AgentManager', () => {
  let app: TokenRingApp;
  let manager: AgentManager;

  beforeEach(() => {
    vi.clearAllMocks();

    app = createTestingApp();
    manager = new AgentManager(app);
    app.addServices(manager);
    
    // Add test configurations
    manager.addAgentConfigs(mockConfig);
    manager.addAgentConfigs({
      ...mockConfig,
      agentType: 'background',
      displayName: 'Background Agent',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Properties', () => {
    it('should have correct name and description', () => {
      expect(manager.name).toBe('AgentManager');
      expect(manager.description).toBe('A service which manages agent configurations and spawns agents.');
    });
  });

  describe('Configuration Management', () => {
    it('should add single agent config', () => {
      const testConfig: ParsedAgentConfig = {
        ...mockConfig,
        agentType: 'new',
        displayName: 'New Agent',
      };

      manager.addAgentConfigs('new', testConfig);
      
      const entries = Array.from(manager.getAgentConfigEntries());
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['new']),
        ])
      );
    });

    it('should add multiple agent configs', () => {
      manager.addAgentConfigs(
        { agentType: 'config1', displayName: 'Agent 1', description: 'desc', category: 'test', createMessage: 'msg' },
        { agentType: 'config2', displayName: 'Agent 2', description: 'desc', category: 'test', createMessage: 'msg' }
      );

      const entries = Array.from(manager.getAgentConfigEntries());
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['config1']),
          expect.arrayContaining(['config2']),
        ])
      );
    });

    it('should get all agent types', () => {
      const types = manager.getAgentTypes();
      expect(types).toContain('test');
      expect(types).toContain('background');
    });

    it('should get agent config entries', () => {
      const entries = Array.from(manager.getAgentConfigEntries());
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['test']),
          expect.arrayContaining(['background']),
        ])
      );
    });

    it('should get agent types like pattern', () => {
      const entries = manager.getAgentTypesLike('te*');
      expect(entries[0][0]).toEqual('test');
    });
  });

  describe('Agent Creation', () => {
    it('should spawn agent from config', async () => {
      const agent = await manager.spawnAgentFromConfig(mockConfig);
      
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.displayName).toBe(mockConfig.displayName);
    });

    it('should spawn agent by type', async () => {
      const agent = await manager.spawnAgent({ agentType: 'test', headless: true });
      
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.displayName).toBe('Test Agent');
    });

    it('should spawn agent from checkpoint', async () => {
      const checkpoint = {
        agentId: 'test-agent-id',
        createdAt: Date.now(),
        agentType: 'test',
        sessionId: 'test-session',
        state: {},
      };

      const agent = await manager.spawnAgentFromCheckpoint(checkpoint, { headless: true });
      
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.agentType).toBe('test');
    });
  });

  describe('Sub-Agent Management', () => {
    it('should spawn sub-agent', async () => {
      const mockAgent = createMockAgent();
      const subAgent = await manager.spawnSubAgent(mockAgent, 'background', {
        headless: true 
      });
      
      expect(subAgent).toBeInstanceOf(Agent);
      expect(subAgent.config.agentType).toBe('background');
    });

    it('should transfer state from parent to sub-agent', async () => {
      const transferStateFromParent = vi.fn();
      class TestState {
        readonly name = "TestState";
        transferStateFromParent = transferStateFromParent;
      }

      const mockAgent = createMockAgent();
      app.addServices({
        attach(agent: Agent) {
          agent.initializeState(TestState, {});
        }
      });

      await manager.spawnSubAgent(mockAgent, 'test', {
        headless: true 
      });
      
      expect(transferStateFromParent).toHaveBeenCalledWith(mockAgent);
    });
  });

  describe('Agent Storage and Retrieval', () => {
    it('should store and retrieve agents', async () => {
      const agent = await manager.spawnAgent({ agentType: 'test', headless: true });
      
      const retrievedAgent = manager.getAgent(agent.id);
      expect(retrievedAgent).toBe(agent);
    });

    it('should return null for non-existent agent', () => {
      const result = manager.getAgent('non-existent-id');
      expect(result).toBeNull();
    });

    it('should get all agents', async () => {
      await manager.spawnAgent({ agentType: 'test', headless: true });
      await manager.spawnAgent({ agentType: 'background', headless: true });
      
      const agents = manager.getAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0]).toBeInstanceOf(Agent);
    });
  });

  describe('Agent Deletion', () => {
    it('should delete agent correctly', async () => {
      const agent = await manager.spawnAgent({ agentType: 'test', headless: true });

      await manager.deleteAgent(agent.id, 'AgentManager initiated shutdown');
      
      expect(manager.getAgent(agent.id)).toBeNull();
    });
  });

  describe('Idle Agent Cleanup', () => {
    beforeEach(() => {
      // Mock Date.now to control time
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delete idle agents exceeding timeout', async () => {
      // Create agent with short timeout
      const shortTimeoutConfig = AgentConfigSchema.parse({
        ...mockConfig,
        agentType: 'short',
        displayName: 'Short Timeout Agent',
        idleTimeout: 1, // 1 second
      });
      manager.addAgentConfigs('short', shortTimeoutConfig);
      
      const agent = await manager.spawnAgent({ agentType: 'short', headless: true });
      
      // Mock agent to be idle
      vi.spyOn(agent, 'getIdleDuration').mockReturnValue(2000); // 2 seconds > 1 second timeout

      vi.spyOn(app, 'serviceOutput');
      
      // Trigger cleanup
      await manager['checkAndDeleteIdleAgents']();
      
      expect(app.serviceOutput).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Agent')
      );
    });

    it('should not delete active agents', async () => {
      const agent = await manager.spawnAgent({ agentType: 'test', headless: true });
      
      // Mock agent to be active (idle duration < timeout)
      vi.spyOn(agent, 'getIdleDuration').mockReturnValue(1000); // 1 second < 86400 second timeout

      // Trigger cleanup
      await manager['checkAndDeleteIdleAgents']();
      
      expect(manager.getAgent(agent.id)).toBe(agent);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing agent type', async () => {
      await expect(manager.spawnAgent({ 
        agentType: 'non-existent', 
        headless: true 
      })).rejects.toThrow();
    });

    it('should handle missing agent config', async () => {
      await expect(manager.spawnAgentFromCheckpoint({
        agentId: 'test',
        createdAt: Date.now(),
        agentType: 'non-existent',
        sessionId: 'test',
        state: {},
      })).rejects.toThrow();
    });
  });

  describe('Minimum Running Agents', () => {
    it('should spawn minimum number of agents', async () => {
      const minRunningConfig = AgentConfigSchema.parse({
        ...mockConfig,
        agentType: 'min-test',
        displayName: 'Min Running Agent',
        minimumRunning: 2,
      });
      manager.addAgentConfigs('min-test', minRunningConfig);

      // Trigger cleanup which should check minimum running
      await manager['checkAndDeleteIdleAgents']();
      
      // Wait a bit for async agent spawning
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const agents = manager.getAgents().filter(a => a.config.agentType === 'min-test');
      expect(agents.length).toBeGreaterThanOrEqual(2);
    });
  });
});
