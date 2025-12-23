import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Agent from '../../Agent.ts';
import AgentCommandService from '../../services/AgentCommandService.ts';
import AgentLifecycleService from '../../services/AgentLifecycleService.ts';
import AgentManager from '../../services/AgentManager.ts';
import {AgentEventState} from "../../state/agentEventState";
import {CommandHistoryState} from "../../state/commandHistoryState";
import {CostTrackingState} from "../../state/costTrackingState";
import type { AgentConfig, HookConfig } from '../../types.js';

// Mock TokenRingApp with all required methods
const createMockApp = () => ({
  requireService: vi.fn(),
  getService: vi.fn(),
  getServices: vi.fn().mockReturnValue([]),
  trackPromise: vi.fn(),
  serviceOutput: vi.fn(),
  serviceError: vi.fn(),
  scheduleEvery: vi.fn(),
  getState: vi.fn().mockReturnValue({}),
  subscribeState: vi.fn(),
  waitForState: vi.fn(),
  timedWaitForState: vi.fn(),
  subscribeStateAsync: vi.fn(),
});

const mockConfig: AgentConfig = {
  name: 'Integration Test Agent',
  description: 'An agent for integration testing',
  category: 'test',
  debug: false,
  visual: { color: '#blue' },
  initialCommands: ['test message'],
  type: 'interactive',
  callable: true,
  idleTimeout: 86400,
  maxRunTime: 1800,
};

describe('Agent Integration Tests', () => {
  let app: any;
  let agent: Agent;
  let commandService: AgentCommandService;
  let lifecycleService: AgentLifecycleService;
  let manager: AgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createMockApp();
    
    // Create services
    commandService = new AgentCommandService();
    lifecycleService = new AgentLifecycleService();
    manager = new AgentManager(app);
    
    // Register services with app mock
    app.requireService.mockImplementation((type: any) => {
      if (type === AgentCommandService) return commandService;
      if (type === AgentLifecycleService) return lifecycleService;
      if (type === AgentManager) return manager;
    });
    
    app.getService.mockImplementation((type: any) => {
      if (type === AgentLifecycleService) return lifecycleService;
      return undefined;
    });

    // Create agent
    agent = new Agent(app, { config: mockConfig, headless: true });
  });

  afterEach(() => {
    if (agent) {
      agent.shutdown();
    }
    vi.clearAllMocks();
  });

  describe('Agent with Command Service Integration', () => {
    it('should handle commands through command service', async () => {
      // Register a test command
      const testCommand = {
        description: 'Test command',
        execute: vi.fn().mockResolvedValue('Command executed'),
        help: 'Test command help',
      };
      
      commandService.addAgentCommands({
        'test': testCommand,
      });

      // Execute command through agent
      await agent.runCommand('/test argument');

      // Verify command was executed
      expect(testCommand.execute).toHaveBeenCalledWith('argument', agent);
    });

    it('should handle chat messages through default command', async () => {
      // Register chat command
      const chatCommand = {
        description: 'Chat command',
        execute: vi.fn().mockResolvedValue('Chat handled'),
        help: 'Chat help',
      };
      
      commandService.addAgentCommands({
        'chat': chatCommand,
      });

      // Send chat message
      agent.handleInput({ message: 'hello world' });

      // Verify the message was added to events
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events).toHaveLength(1);
      expect(eventState.events[0]).toMatchObject({
        type: 'input.received',
        message: 'hello world',
      });
    });

    it('should handle unknown commands gracefully', async () => {
      vi.spyOn(agent, 'errorLine')
      await agent.runCommand('/unknown command');
      
      expect(agent.errorLine).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command')
      );
    });
  });

  describe('Agent with Lifecycle Service Integration', () => {
    let testHook: HookConfig;

    beforeEach(() => {
      testHook = {
        name: 'test-hook',
        description: 'Test hook for integration',
        afterChatCompletion: vi.fn(),
        afterTesting: vi.fn(),
      };
      
      lifecycleService.registerHook('test', testHook);
      lifecycleService.setEnabledHooks(['test'], agent);
    });

    it('should execute hooks during agent lifecycle', async () => {
      // Simulate chat completion
      await lifecycleService.executeHooks(agent, 'afterChatCompletion', 'test message');
      
      expect(testHook.afterChatCompletion).toHaveBeenCalledWith(agent, 'test message');
    });

    it('should handle hook execution in agent context', async () => {
      // Test that hooks can access agent state
      agent.handleInput({ message: 'test' });
      
      await lifecycleService.executeHooks(agent, 'afterChatCompletion');
      
      expect(testHook.afterChatCompletion).toHaveBeenCalledWith(agent);
    });

    it('should manage hook state correctly', () => {
      const enabledHooks = lifecycleService.getEnabledHooks(agent);
      expect(enabledHooks).toContain('test');
    });
  });

  describe('Complete Agent Workflow', () => {
    it('should handle complete input to output workflow', async () => {
      // Setup command that produces output
      const workflowCommand = {
        description: 'Workflow command',
        execute: vi.fn().mockImplementation(async (input: string, agent: Agent) => {
          agent.chatOutput(`Processed: ${input}`);
        }),
        help: 'Workflow help',
      };
      
      commandService.addAgentCommands({
        'workflow': workflowCommand,
      });

      // Handle input
      agent.handleInput({ message: 'test input' });

      // Process the request
      await agent.runCommand('/workflow test input');

      // Verify state changes
      const eventState = agent.getState(AgentEventState);
      const outputEvents = eventState.events.filter(e => e.type === 'output.chat');
      
      expect(outputEvents).toHaveLength(1);
      expect(outputEvents[0].message).toBe('Processed: test input');
    });

  });

  describe('Manager Integration', () => {
    it('should create agents through manager', async () => {
      manager.addAgentConfig('test', mockConfig);
      
      const managedAgent = await manager.spawnAgent({ agentType: 'test', headless: true });
      
      expect(managedAgent).toBeInstanceOf(Agent);
      expect(managedAgent.config.name).toBe('Integration Test Agent');
    });

    it('should handle sub-agent creation', async () => {
      manager.addAgentConfig('test', mockConfig);
      
      const subAgent = await manager.spawnSubAgent(agent, { 
        agentType: 'test', 
        headless: true 
      });
      
      expect(subAgent).toBeInstanceOf(Agent);
      expect(subAgent).not.toBe(agent);
    });
  });

  describe('State Management Integration', () => {
    it('should persist state across operations', () => {
      // Add some state
      agent.addCost('tokens', 100);
      agent.handleInput({ message: 'test message' });
      
      // Generate checkpoint
      const checkpoint = agent.generateCheckpoint();
      
      // Create new agent and restore state
      const newAgent = new Agent(app, { config: mockConfig, headless: true });
      newAgent.restoreState(checkpoint.state);
      
      // Verify state was restored
      const costState = newAgent.getState(CostTrackingState);
      expect(costState.costs.tokens).toBe(100);
    });

  });

  describe('Service Registry Integration', () => {
    it('should resolve services through agent interface', () => {
      const resolvedCommandService = agent.requireServiceByType(AgentCommandService);
      expect(resolvedCommandService).toBe(commandService);
      
      const resolvedLifecycleService = agent.getServiceByType(AgentLifecycleService);
      expect(resolvedLifecycleService).toBe(lifecycleService);
    });

    it('should handle missing services gracefully', () => {
      const missingService = agent.getServiceByType(class MissingService {});
      expect(missingService).toBeUndefined();
    });
  });

  describe('Complex Multi-Service Scenarios', () => {
    it('should handle command execution with hooks', async () => {
      const hookCalled = vi.fn();
      const testHook: HookConfig = {
        name: 'integration-hook',
        description: 'Integration test hook',
        afterAgentInputComplete: vi.fn().mockImplementation((agent: Agent, message: string) => {
          hookCalled(message);
        }),
      };
      
      lifecycleService.registerHook('integration', testHook);
      lifecycleService.setEnabledHooks(['integration'], agent);

      const testCommand = {
        description: 'Test command',
        execute: vi.fn().mockImplementation(async (input: string, agent: Agent) => {
          // Simulate processing
          await lifecycleService.executeHooks(agent, 'afterAgentInputComplete', input);
        }),
        help: 'Test help',
      };
      
      commandService.addAgentCommands({
        'test': testCommand,
      });

      await agent.runCommand('/test integration message');
      
      expect(testCommand.execute).toHaveBeenCalledWith('integration message', agent);
      expect(testHook.afterAgentInputComplete).toHaveBeenCalledWith(agent, 'integration message');
      expect(hookCalled).toHaveBeenCalledWith('integration message');
    });

    it('should handle concurrent operations', () => {
      // Test that multiple operations can be handled
      agent.handleInput({ message: 'message 1' });
      agent.handleInput({ message: 'message 2' });
      agent.handleInput({ message: 'message 3' });
      
      const historyState = agent.getState(CommandHistoryState);
      expect(historyState.commands).toHaveLength(3);
      expect(historyState.commands).toEqual([
        'message 1',
        'message 2',
        'message 3',
      ]);
    });
  });

  describe('Error Recovery Integration', () => {
    it('should recover from command execution errors', async () => {
      const failingCommand = {
        description: 'Failing command',
        execute: vi.fn().mockRejectedValue(new Error('Command failed')),
        help: 'Failing help',
      };
      
      commandService.addAgentCommands({
        'fail': failingCommand,
      });

      // First call should fail
      await expect(agent.runCommand('/fail')).rejects.toThrow();
      
      // Second call should still work
      const workingCommand = {
        description: 'Working command',
        execute: vi.fn().mockResolvedValue('Success'),
        help: 'Working help',
      };
      
      commandService.addAgentCommands({
        'work': workingCommand,
      });
      
      await expect(agent.runCommand('/work')).resolves.toBeUndefined();
      expect(workingCommand.execute).toHaveBeenCalled();
    });

    it('should maintain state integrity after errors', () => {
      // Add some initial state
      agent.addCost('initial', 100);
      
      try {
        // This will fail but shouldn't corrupt state
        agent.handleInput({ message: 'test' });
        throw new Error('Simulated error');
      } catch (error) {
        // State should still be intact
        const costState = agent.getState(CostTrackingState);
        expect(costState.costs.initial).toBe(100);
      }
    });
  });
});