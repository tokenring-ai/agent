import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Agent from '../../Agent.ts';
import {AgentConfig, AgentConfigSchema} from '../../types.js';
import { AgentEventState } from '../../state/agentEventState.ts';
import { CommandHistoryState } from '../../state/commandHistoryState.js';
import { CostTrackingState } from '../../state/costTrackingState.ts';
import { HooksState } from '../../state/hooksState.js';

// Mock TokenRingApp
const mockApp = {
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
} as any;

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

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new Agent(mockApp, { config: mockConfig, headless: true });
  });

  afterEach(() => {
    if (agent) {
      agent.shutdown("Normal shutdown");
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create an agent with correct properties', () => {
      expect(agent.name).toBe(mockConfig.name);
      expect(agent.description).toBe(mockConfig.description);
      expect(agent.id).toBeDefined();
      expect(agent.headless).toBe(true);
    });

    it('should initialize state correctly', () => {
      expect(agent.getState(AgentEventState)).toBeDefined();
      expect(agent.getState(CommandHistoryState)).toBeDefined();
      expect(agent.getState(CostTrackingState)).toBeDefined();
      expect(agent.getState(HooksState)).toBeDefined();
    });

    it('should handle headless mode correctly', () => {
      const headlessAgent = new Agent(mockApp, { config: mockConfig, headless: true });
      expect(headlessAgent.headless).toBe(true);

      const interactiveAgent = new Agent(mockApp, { config: mockConfig, headless: false });
      expect(interactiveAgent.headless).toBe(false);
    });
  });

  describe('Input Handling', () => {
    it('should handle input correctly', () => {
      const message = 'Test message';
      const requestId = agent.handleInput({ message: message });
      
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');

      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: 'input.received',
        message,
        requestId,
      });
    });

    it('should trim input message', () => {
      const message = '  Test message with spaces  ';
      agent.handleInput({ message: message });
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1].message).toBe('Test message with spaces');
    });

    it('should add message to command history', () => {
      const message = 'Test command';
      agent.handleInput({ message: message });
      
      const historyState = agent.getState(CommandHistoryState);
      expect(historyState.commands).toContain(message);
    });
  });

  describe('Output Methods', () => {
    it('should output chat messages', () => {
      agent.chatOutput('Chat message');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: 'output.chat',
        message: 'Chat message',
      });
    });

    it('should output reasoning messages', () => {
      agent.reasoningOutput('Reasoning message');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: 'output.reasoning',
        message: 'Reasoning message',
      });
    });

    it('should output system messages', () => {
      agent.systemMessage('System message');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: 'output.info',
        message: 'System message\n',
      });
    });

    it('should handle different message levels', () => {
      agent.systemMessage('Warning message', 'warning');
      agent.systemMessage('Error message', 'error');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 2].type).toBe('output.warning');
      expect(eventState.events[eventState.events.length - 1].type).toBe('output.error');
    });
  });

  describe('Cost Tracking', () => {
    it('should add costs correctly', () => {
      agent.addCost('token', 100);
      agent.addCost('api', 50);
      
      const costState = agent.getState(CostTrackingState);
      expect(costState.costs.token).toBe(100);
      expect(costState.costs.api).toBe(50);
    });

    it('should accumulate costs for same category', () => {
      agent.addCost('tokens', 100);
      agent.addCost('tokens', 50);
      
      const costState = agent.getState(CostTrackingState);
      expect(costState.costs.tokens).toBe(150);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset agent state', () => {
      // Add some state
      agent.handleInput({ message: 'test' });
      agent.addCost('test', 100);
      
      // Reset
      agent.reset(['history','costs']);
      
      const eventState = agent.getState(AgentEventState);
      const historyState = agent.getState(CommandHistoryState);
      const costState = agent.getState(CostTrackingState);
      
      expect(eventState.events.length).toEqual(3);
      expect(historyState.commands).toEqual([]);
      expect(costState.costs).toEqual({});
    });
  });

  describe('Agent Lifecycle', () => {
    it('should calculate idle duration correctly', () => {
      const startTime = Date.now();
      vi.useFakeTimers({ now: startTime });
      agent.infoLine("hello world!"); // Sets the last idle time
      
      // Simulate some time passing
      vi.advanceTimersByTime(1000);
      
      const idleDuration = agent.getIdleDuration();
      expect(idleDuration).toBeGreaterThanOrEqual(1000);
    });

    it('should not abort when agent is idle', () => {
      const reason = 'Test abort reason';
      agent.requestAbort(reason);
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events).toHaveLength(1);
      expect(eventState.events[0]).not.toMatchObject({
        type: 'abort',
        reason,
      });
    });

    it('should handle abort requests', () => {
      agent.mutateState(AgentEventState, state => {
        state.inputQueue.push("doesn't matter" as any);
      });

      expect(agent.getState(AgentEventState).idle).toBe(false);

      const reason = 'Test abort reason';
      agent.requestAbort(reason);

      const eventState = agent.getState(AgentEventState);
      expect(eventState.events).toHaveLength(3);
      expect(eventState.events[1]).toMatchObject({
        type: 'abort',
        timestamp: expect.any(Number),
        reason,
      });
      expect(eventState.events[2]).toMatchObject({
        type: 'output.info',
        timestamp: expect.any(Number),
        message: "Aborting current operation, Test abort reason",
      });
    });
  });

  describe('Human Interface', () => {
    it('should throw error when asking human in headless mode', async () => {
      await expect(agent.askHuman('text', { prompt: 'Test' })).rejects.toThrow(
        'Cannot ask human for feedback when agent is running in headless mode'
      );
    });

    it('should handle busyWhile correctly', async () => {
      const promise = Promise.resolve('result');
      const result = await agent.busyWhile('Loading...', promise);
      
      expect(result).toBe('result');
      const eventState = agent.getState(AgentEventState);
      expect(eventState.busyWith).toBeNull(); // Should be cleared after completion
    });
  });

  describe('Configuration', () => {
    it('should get config slice with valid schema', () => {
      const visual = agent.getAgentConfigSlice('visual', AgentConfigSchema.shape.visual);
      expect(visual).toEqual(mockConfig.visual);
    });

    it('should throw error for invalid config slice', () => {
      expect(() => {
        agent.getAgentConfigSlice('nonexistent', AgentConfigSchema.shape.visual);
      }).toThrow();
    });
  });

  describe('Checkpointing', () => {
    it('should generate checkpoint data', () => {
      const checkpoint = agent.generateCheckpoint();
      
      expect(checkpoint).toMatchObject({
        agentId: agent.id,
        createdAt: expect.any(Number),
        config: agent.config,
        state: expect.any(Object),
      });
    });

    it('should restore state from checkpoint', () => {
      // Add some state
      agent.mutateState(AgentEventState, state => {
        state.emit({ type: 'input.received', message: 'test', requestId: "abc123", timestamp: expect.any(Number)});
        state.emit({ type: 'input.handled', message: 'test', requestId: "abc123", status: 'success', timestamp: expect.any(Number)});
      })
      agent.handleInput({ message: 'test' });
      agent.addCost('test', 100);
      
      const checkpoint = agent.generateCheckpoint();

      // Reset state
      agent.reset(['history']);
      
      // Restore
      agent.restoreState(checkpoint.state);
      
      const eventState = agent.getState(AgentEventState);
      const costState = agent.getState(CostTrackingState);

      expect(eventState.events[1].type).toEqual('input.received');
      expect(eventState.events[1].message).toEqual('test');

      expect(eventState.events[2].type).toEqual('input.handled');
      expect(eventState.events[2].message).toEqual('test');

      expect(eventState.events[3].type).toEqual('reset');
      expect(eventState.events[3].what).toEqual(['history']);

      expect(costState.costs.test).toBe(100);
    });
  });

  describe('Debug Mode', () => {
    it('should handle debug messages when enabled', () => {
      const debugAgent = new Agent(mockApp, { 
        config: { ...mockConfig, debug: true }, 
        headless: true 
      });
      
      debugAgent.debugLine('Debug message');
      
      const eventState = debugAgent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1].type).toEqual('output.info');
      expect(eventState.events[eventState.events.length - 1].message).toEqual('Debug message\n');
    });

    it('should not output debug messages when disabled', () => {
      agent.debugLine('Debug message');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1].message).not.toEqual('Debug message\n');
    });
  });
});