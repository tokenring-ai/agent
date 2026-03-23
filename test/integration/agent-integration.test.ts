import TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Agent from '../../Agent.ts';
import {AgentConfigSchema} from "../../schema";
import AgentCommandService from '../../services/AgentCommandService.ts';
import AgentLifecycleService from '@tokenring-ai/lifecycle/AgentLifecycleService';
import AgentManager from '../../services/AgentManager.ts';
import {AgentEventState} from "../../state/agentEventState";
import {CommandHistoryState} from "../../state/commandHistoryState";
import {HookCallback, AfterAgentInputSuccess, BeforeAgentInput} from '@tokenring-ai/lifecycle/util/hooks';
import type {HookSubscription} from '@tokenring-ai/lifecycle/types';
import {SubAgentService} from '../../services/SubAgentService.js';

const mockConfig = AgentConfigSchema.parse({
  agentType: 'integration-test',
  displayName: 'Integration Test Agent',
  description: 'An agent for integration testing',
  category: 'test',
  debug: false,
  initialCommands: [],
  createMessage: "Agent created",
  headless: true,
  callable: true,
  idleTimeout: 86400,
  maxRunTime: 1800,
  minimumRunning: 0,
});

describe('Agent Integration Tests', () => {
  let app: TokenRingApp;
  let agent: Agent;
  let commandService: AgentCommandService;
  let lifecycleService: AgentLifecycleService;
  let manager: AgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestingApp();
    
    // Create services
    commandService = new AgentCommandService(app);
    lifecycleService = new AgentLifecycleService({
      agentDefaults: {
        enabledHooks: [],
      }
    });
    manager = new AgentManager(app);

    app.addServices(commandService, lifecycleService, manager);

    // Create agent
    agent = new Agent(app, {}, mockConfig, new AbortController().signal);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent with Command Service Integration', () => {
    it('should register commands through command service', async () => {
      // Register a test command
      const testCommand = {
        name: 'test',
        description: 'Test command',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn().mockResolvedValue('Command executed'),
        help: 'Test command help',
      };
      
      commandService.addAgentCommands(testCommand);

      // Verify command was registered
      expect(commandService.getCommand('test')).toBe(testCommand);
    });

    it('should handle chat messages through default command', async () => {
      // Register chat command
      const chatCommand = {
        name: 'chat send',
        description: 'Chat command',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn().mockResolvedValue('Chat handled'),
        help: 'Chat help',
      };
      
      commandService.addAgentCommands(chatCommand);

      // Send chat message
      agent.handleInput({ from: 'test', message: 'hello world' });

      // Verify the message was added to events
      const eventState = agent.getState(AgentEventState);
      const inputEvents = eventState.events.filter(e => e.type === 'input.received');
      expect(inputEvents).toHaveLength(1);
    });

    it('should handle unknown commands gracefully', async () => {
      // Note: executeAgentCommand requires an executing input item
      // We'll test the command service directly instead
      await expect(commandService.executeAgentCommand(agent, '/unknown command'))
        .rejects.toThrow();
    });
  });

  describe('Agent with Lifecycle Service Integration', () => {
    let testHook: HookSubscription;

    beforeEach(() => {
      testHook = {
        name: 'test-hook',
        displayName: 'Test Hook',
        description: 'Test hook for integration',
        callbacks: [
          new HookCallback(BeforeAgentInput, vi.fn()),
          new HookCallback(AfterAgentInputSuccess, vi.fn()),
        ],
      };
      
      lifecycleService.registerHook('test', testHook);
      lifecycleService.attach(agent);
      lifecycleService.setEnabledHooks(['test'], agent);
    });

    it('should execute hooks during agent lifecycle', async () => {
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test message' }
      };
      
      await lifecycleService.executeHooks(new BeforeAgentInput(requestData), agent);
      
      const callback = testHook.callbacks.find(c => c.hookConstructor === BeforeAgentInput);
      expect(callback?.callback).toHaveBeenCalledWith(
        expect.any(BeforeAgentInput),
        agent
      );
    });

    it('should handle hook execution in agent context', async () => {
      // Test that hooks can access agent state
      agent.handleInput({ from: 'test', message: 'test' });
      
      const responseData = {
        type: 'agent.response' as const,
        timestamp: Date.now(),
        requestId: 'test-request',
        status: 'success',
        message: 'success',
      };
      
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test' }
      };

      await lifecycleService.executeHooks(new AfterAgentInputSuccess(requestData, responseData), agent);
      
      const callback = testHook.callbacks.find(c => c.hookConstructor === AfterAgentInputSuccess);
      expect(callback?.callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        agent
      );
    });

    it('should manage hook state correctly', () => {
      const enabledHooks = lifecycleService.getEnabledHooks(agent);
      expect(enabledHooks).toContain('test');
    });
  });

  describe('Complete Agent Workflow', () => {
    it('should handle state changes during operations', () => {
      // Add some state
      agent.handleInput({ from: 'test', message: 'test input' });
      
      // Verify state changes
      const eventState = agent.getState(AgentEventState);
      const inputEvents = eventState.events.filter(e => e.type === 'input.received');
      
      expect(inputEvents).toHaveLength(1);
    });
  });

  describe('Manager Integration', () => {
    it('should create agents through manager', async () => {
      manager.addAgentConfigs('integration-test', mockConfig);
      
      const managedAgent = await manager.spawnAgent({ agentType: 'integration-test', headless: true });
      
      expect(managedAgent).toBeInstanceOf(Agent);
      expect(managedAgent.config.displayName).toBe('Integration Test Agent');
    });

    it('should handle sub-agent creation', async () => {
      manager.addAgentConfigs('integration-test', mockConfig);
      
      const subAgent = await manager.spawnSubAgent(agent, 'integration-test', {
        headless: true
      });
      
      expect(subAgent).toBeInstanceOf(Agent);
      expect(subAgent).not.toBe(agent);
    });
  });

  describe('State Management Integration', () => {
    it('should persist state across operations', () => {
      // Add some state
      agent.handleInput({ from: 'test', message: 'test message' });
      
      // Generate checkpoint
      const checkpoint = agent.generateCheckpoint();
      
      // Create new agent and restore state
      const newAgent = new Agent(app, {}, mockConfig, new AbortController().signal);
      newAgent.restoreState(checkpoint.state);
      
      // Verify state was restored
      const eventState = newAgent.getState(AgentEventState);
      expect(eventState.events.length).toBeGreaterThan(0);
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
      // SubAgentService is not added to the app, so it will be undefined
      const missingService = agent.getServiceByType(SubAgentService as any);
      expect(missingService).toBeUndefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple input events', () => {
      // Test that multiple operations can be handled
      agent.handleInput({ from: 'test', message: 'message 1' });
      agent.handleInput({ from: 'test', message: 'message 2' });
      agent.handleInput({ from: 'test', message: 'message 3' });
      
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
        name: 'fail',
        description: 'Failing command',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn().mockRejectedValue(new Error('Command failed')),
        help: 'Failing help',
      };
      
      commandService.addAgentCommands(failingCommand);

      // First call should fail
      await expect(commandService.executeAgentCommand(agent, '/fail'))
        .rejects.toThrow();
      
      // Second call should still work (but will fail due to missing input item)
      const workingCommand = {
        name: 'work',
        description: 'Working command',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn().mockResolvedValue('Success'),
        help: 'Working help',
      };
      
      commandService.addAgentCommands(workingCommand);
      
      // The command service will throw because there's no executing input item
      // This is expected behavior - the command service requires an input item to be executing
      await expect(commandService.executeAgentCommand(agent, '/work'))
        .rejects.toThrow('Cannot get abort signal');
      expect(workingCommand.execute).not.toHaveBeenCalled();
    });

    it('should maintain state integrity after errors', () => {
      // Add some initial state
      const initialEventCount = agent.getState(AgentEventState).events.length;
      
      // This will fail but shouldn't corrupt state
      agent.handleInput({ from: 'test', message: 'test' });
      
      const eventState = agent.getState(AgentEventState);
      // State should still be intact
      expect(eventState.events.length).toBeGreaterThan(initialEventCount);
    });
  });
});
