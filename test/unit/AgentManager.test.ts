import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AgentManager from '../../services/AgentManager.ts';
import TokenRingApp from '@tokenring-ai/app';
import Agent from '../../Agent.ts';
import type { AgentConfig, AgentCheckpointData } from '../../types.js';
import createTestingAgent from "../createTestingAgent";

const app = createTestingApp();

// Create a mock agent
const createMockAgent = () => {
  const agent = createTestingAgent(app);
  vi.spyOn(agent, 'requireServiceByType');
  vi.spyOn(agent, 'chatOutput');
  vi.spyOn(agent, 'infoLine');
  vi.spyOn(agent, 'errorLine');

  return agent;
};


const mockConfig: AgentConfig = {
  name: 'Test Agent',
  description: 'A test agent',
  category: 'test',
  debug: false,
  visual: { color: '#blue' },
  initialCommands: [],
  type: 'interactive',
  callable: true,
  idleTimeout: 86400,
  maxRunTime: 1800,
};

const mockCheckpoint: AgentCheckpointData = {
  agentId: 'test-agent-id',
  createdAt: Date.now(),
  config: mockConfig,
  state: {},
};

describe('AgentManager', () => {
  let app: TokenRingApp;
  let manager: AgentManager;

  beforeEach(() => {
    vi.clearAllMocks();

    app = createTestingApp();
    vi.spyOn(app, 'scheduleEvery');
    manager = new AgentManager(app);
    app.addServices(manager);
    
    // Add test configurations
    manager.addAgentConfig('test', mockConfig);
    manager.addAgentConfig('background', {
      ...mockConfig,
      name: 'Background Agent',
      type: 'background',
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
      const testConfig: AgentConfig = {
        ...mockConfig,
        name: 'New Agent',
      };

      manager.addAgentConfig('new', testConfig);
      
      const configs = manager.getAgentConfigs();
      expect(configs).toHaveProperty('new');
      expect(configs.new.name).toBe('New Agent');
    });

    it('should add multiple agent configs', () => {
      manager.addAgentConfigs({
        'config1': { ...mockConfig, name: 'Agent 1' },
        'config2': { ...mockConfig, name: 'Agent 2' },
      });

      const configs = manager.getAgentConfigs();
      expect(configs.config1.name).toBe('Agent 1');
      expect(configs.config2.name).toBe('Agent 2');
    });

    it('should get all agent types', () => {
      const types = manager.getAgentTypes();
      expect(types).toContain('test');
      expect(types).toContain('background');
    });

    it('should get agent configs', () => {
      const configs = manager.getAgentConfigs();
      expect(configs).toHaveProperty('test');
      expect(configs).toHaveProperty('background');
    });
  });

  describe('Agent Creation', () => {
    it('should spawn agent from config', async () => {
      const agent = await manager.spawnAgentFromConfig(mockConfig, { headless: true });
      
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.name).toBe(mockConfig.name);
    });

    it('should spawn agent by type', async () => {
      const agent = await manager.spawnAgent({ agentType: 'test', headless: true });
      
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config.name).toBe('Test Agent');
    });

    it('should spawn agent from checkpoint', async () => {
      const agent = await manager.spawnAgentFromCheckpoint(app, mockCheckpoint, { headless: true });
      
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.config).toEqual(mockCheckpoint.config);
    });
  });

  describe('Sub-Agent Management', () => {
    it('should spawn sub-agent', async () => {
      const mockAgent = createMockAgent();
      const subAgent = await manager.spawnSubAgent(mockAgent, { 
        agentType: 'background', 
        headless: true 
      });
      
      expect(subAgent).toBeInstanceOf(Agent);
      expect(subAgent.config.type).toBe('background');
    });

    it('should transfer state from parent to sub-agent', async () => {
      const transferStateFromParent = vi.fn();
      class TestState {
        name = "TestState";
        transferStateFromParent = transferStateFromParent;
      }

      const mockAgent = createMockAgent();
      app.addServices({
        attach(agent: Agent) {
          agent.initializeState(TestState, {});
        }
      });


      await manager.spawnSubAgent(mockAgent, { 
        agentType: 'test', 
        headless: true 
      });
      
      expect(transferStateFromParent).toHaveBeenCalledWith(mockAgent);
    });

    it('should send system message when creating sub-agent', async () => {
      const mockAgent = createMockAgent();
      vi.spyOn(mockAgent, 'systemMessage');

      await manager.spawnSubAgent(mockAgent, { 
        agentType: 'test', 
        headless: true 
      });
      
      expect(mockAgent.systemMessage).toHaveBeenCalled();
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
      vi.spyOn(agent, 'requestAbort');
      
      await manager.deleteAgent(agent);
      
      expect(agent.requestAbort).toHaveBeenCalledWith('AgentManager initiated shutdown');
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
      const shortTimeoutConfig = { ...mockConfig, idleTimeout: 1 }; // 1 second
      manager.addAgentConfig('short', shortTimeoutConfig);
      
      const agent = await manager.spawnAgent({ agentType: 'short', headless: true });
      
      // Mock agent to be idle
      vi.spyOn(agent, 'getIdleDuration').mockReturnValue(2000); // 2 seconds > 1 second timeout

      vi.spyOn(app, 'serviceOutput');
      vi.spyOn(agent, 'requestAbort');
      // Trigger cleanup
      await manager['checkAndDeleteIdleAgents']();
      
      expect(agent.requestAbort).toHaveBeenCalledWith('AgentManager initiated shutdown');
      expect(app.serviceOutput).toHaveBeenCalledWith(
        expect.stringContaining('Agent')
      );
    });

    it('should not delete active agents', async () => {
      const agent = await manager.spawnAgent({ agentType: 'test', headless: true });
      
      // Mock agent to be active (idle duration < timeout)
      vi.spyOn(agent, 'getIdleDuration').mockReturnValue(1000); // 1 second < 86400 second timeout

      vi.spyOn(agent, 'requestAbort');
      // Trigger cleanup
      await manager['checkAndDeleteIdleAgents']();
      
      expect(agent.requestAbort).not.toHaveBeenCalled();
    });

  });

  describe('Periodic Cleanup Scheduling', () => {
    it('should schedule periodic cleanup', () => {
      expect(app.scheduleEvery).toHaveBeenCalledWith(60000, expect.any(Function));
    });
  });

  describe('Error Handling', () => {
    it('should handle missing agent type', async () => {
      await expect(manager.spawnAgent({ 
        agentType: 'non-existent', 
        headless: true 
      })).rejects.toThrow();
    });

    it('should handle config validation errors', () => {
      const invalidConfig = {
        name: 'Invalid Agent',
        description: 'Invalid agent',
        category: 'test',
        type: 'interactive' as const,
        visual: { color: '#blue' },
        initialCommands: [],
        callable: true,
        idleTimeout: 86400,
        maxRunTime: 1800,
      };

      expect(() => {
        manager.addAgentConfig('invalid', invalidConfig as AgentConfig);
      }).not.toThrow();
    });
  });
});