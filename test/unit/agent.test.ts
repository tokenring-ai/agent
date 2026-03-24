import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Agent from '../../Agent.ts';
import {AgentConfigSchema, type ParsedAgentConfig} from "../../schema";
import {AgentEventState} from '../../state/agentEventState.ts';
import {CommandHistoryState} from '../../state/commandHistoryState.js';
import createTestingAgent from "../createTestingAgent";

import { setTimeout as delay } from 'node:timers/promises';

const app = createTestingApp();

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = createTestingAgent(app);
  });

  afterEach(() => {
    if (agent) {
      // Agent doesn't have shutdown method, just clear mocks
      vi.clearAllMocks();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create an agent with correct properties', () => {
      expect(agent.displayName).toBe(agent.config.displayName);
      expect(agent.config.description).toBe(agent.config.description);
      expect(agent.id).toBeDefined();
      // headless is set from config
      expect(agent.headless).toBe(agent.config.headless);
    });

    it('should initialize state correctly', () => {
      expect(agent.getState(AgentEventState)).toBeDefined();
      expect(agent.getState(CommandHistoryState)).toBeDefined();
    });
  });

  describe('Input Handling', () => {
    it('should handle input correctly', () => {
      const message = 'Test message';
      const requestId = agent.handleInput({ from: 'test', message: message });
      
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');

      const eventState = agent.getState(AgentEventState);
      const lastEvent = eventState.events.find(e => e.type === 'input.received');
      expect(lastEvent).toBeDefined();
      expect(lastEvent!.type).toBe('input.received');
      expect(lastEvent!.requestId).toBe(requestId);
    });

    it('should not trim input message (trimming happens in command service)', () => {
      const message = '  Test message with spaces  ';
      agent.handleInput({ from: 'test', message: message });
      
      const eventState = agent.getState(AgentEventState);
      // Find the input.received event
      const inputEvent = eventState.events.find(e => e.type === 'input.received');
      expect(inputEvent).toBeDefined();
      expect(inputEvent!.input.message).toBe(message);
    });

    it('should add message to command history', () => {
      const message = 'Test command';
      agent.handleInput({ from: 'test', message: message });
      
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

    it('should output info messages', () => {
      agent.infoMessage('Info message');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: 'output.info',
        message: 'Info message',
      });
    });

    it('should handle different message levels', () => {
      agent.warningMessage('Warning message');
      agent.errorMessage('Error message');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 2].type).toBe('output.warning');
      expect(eventState.events[eventState.events.length - 1].type).toBe('output.error');
    });
  });

  describe('Agent Lifecycle', () => {
    it('should calculate idle duration correctly', () => {
      const startTime = Date.now();
      vi.useFakeTimers({ now: startTime });
      agent.infoMessage("hello world!"); // Sets the last activity time
      
      // Simulate some time passing
      vi.advanceTimersByTime(1000);
      
      const idleDuration = agent.getIdleDuration();
      expect(idleDuration).toBeGreaterThanOrEqual(1000);
    });

    it('should calculate run duration correctly', () => {
      const startTime = Date.now();
      vi.useFakeTimers({ now: startTime });
      
      // Trigger an event to set the first activity time
      agent.infoMessage("start");
      
      vi.advanceTimersByTime(2000);
      
      const runDuration = agent.getRunDuration();
      expect(runDuration).toBeGreaterThanOrEqual(2000);
    });

    it('should abort current operation when there is one', () => {
      // Add an input item to the queue
      agent.mutateState(AgentEventState, (state) => {
        state.inputQueue.push({
          request: {
            type: 'input.received',
            requestId: 'test-request',
            timestamp: Date.now(),
            input: { from: 'test', message: 'test' }
          },
          executionState: {
            status: 'queued',
            currentActivity: 'test',
            availableInteractions: []
          },
          interactionCallbacks: new Map(),
          abortController: new AbortController()
        });
        state.currentlyExecutingInputItem = state.inputQueue[0];
      });

      const reason = 'Test abort reason';
      const result = agent.abortCurrentOperation(reason);
      
      expect(result).toBe(true);
      const eventState = agent.getState(AgentEventState);
      expect(eventState.currentlyExecutingInputItem?.abortController.signal.aborted).toBe(true);
    });

    it('should return false when aborting with no current operation', () => {
      const reason = 'Test abort reason';
      const result = agent.abortCurrentOperation(reason);
      
      expect(result).toBe(false);
    });
  });

  describe('Human Interface', () => {
    it('should throw error when asking human in headless mode', async () => {
      agent.config.headless = true;
      await expect(agent.askForApproval({ message: 'foo' })).rejects.toThrow(
        'Cannot ask human for feedback when agent is running in headless mode'
      );
    });

    it('should handle busyWithActivity correctly', async () => {
      // Setup: need an input item to be executing
      const abortController = new AbortController();
      agent.mutateState(AgentEventState, (state) => {
        state.currentlyExecutingInputItem = {
          request: {
            type: 'input.received',
            requestId: 'test-request',
            timestamp: Date.now(),
            input: { from: 'test', message: 'test' }
          },
          executionState: {
            status: 'running',
            currentActivity: 'initial',
            availableInteractions: []
          },
          interactionCallbacks: new Map(),
          abortController
        };
      });

      const promise = Promise.resolve('result');
      const result = await agent.busyWithActivity('Loading...', promise);
      
      expect(result).toBe('result');
      
      // After completion, the activity should be restored
      const eventState = agent.getState(AgentEventState);
      expect(eventState.currentlyExecutingInputItem?.executionState.currentActivity).toBe('initial');
    });

    it('should set current activity', () => {
      const abortController = new AbortController();
      agent.mutateState(AgentEventState, (state) => {
        state.currentlyExecutingInputItem = {
          request: {
            type: 'input.received',
            requestId: 'test-request',
            timestamp: Date.now(),
            input: { from: 'test', message: 'test' }
          },
          executionState: {
            status: 'running',
            currentActivity: 'initial',
            availableInteractions: []
          },
          interactionCallbacks: new Map(),
          abortController
        };
      });

      agent.setCurrentActivity('New activity');
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.currentlyExecutingInputItem?.executionState.currentActivity).toBe('New activity');
    });
  });

  describe('Configuration', () => {
    it('should get config slice with valid schema', () => {
      const displayName = agent.getAgentConfigSlice('displayName', AgentConfigSchema.shape.displayName);
      expect(displayName).toEqual(agent.config.displayName);
    });

    it('should throw error for invalid config slice', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid key
        agent.getAgentConfigSlice('nonexistent', AgentConfigSchema.shape.displayName);
      }).toThrow();
    });
  });

  describe('Checkpointing', () => {
    it('should generate checkpoint data', () => {
      const checkpoint = agent.generateCheckpoint();
      
      expect(checkpoint).toMatchObject({
        agentId: agent.id,
        createdAt: expect.any(Number),
        sessionId: agent.app.sessionId,
        agentType: agent.config.agentType,
        state: expect.any(Object),
      });
      
      // Checkpoint does NOT include config
      expect((checkpoint as any).config).toBeUndefined();
    });

    it('should restore state from checkpoint', () => {
      // Add some state
      agent.handleInput({ from: 'test', message: 'test' });
      
      const checkpoint = agent.generateCheckpoint();

      // Create new agent and restore
      const newAgent = createTestingAgent(app);
      newAgent.restoreState(checkpoint.state);
      
      const eventState = newAgent.getState(AgentEventState);
      // Events should be restored (with cleanup during restore)
      expect(eventState.events.length).toBeGreaterThan(0);
    });
  });

  describe('Debug Mode', () => {
    it('should handle debug messages when enabled', () => {
      const debugConfig = AgentConfigSchema.parse({
        agentType: 'test',
        displayName: 'Test',
        description: 'Test',
        category: 'test',
        debug: true,
        createMessage: 'Test',
        headless: true,
      });
      
      const debugAgent = new Agent(app, {}, debugConfig, new AbortController().signal);
      
      debugAgent.debugMessage('Debug message');
      
      const eventState = debugAgent.getState(AgentEventState);
      const lastEvent = eventState.events[eventState.events.length - 1];
      expect(lastEvent.type).toEqual('output.info');
      expect(lastEvent.message).toEqual('Debug message');
    });

    it('should not output debug messages when disabled', () => {
      const initialEventCount = agent.getState(AgentEventState).events.length;
      
      agent.debugMessage('Debug message');
      
      const eventState = agent.getState(AgentEventState);
      // No new events should be added
      expect(eventState.events.length).toBe(initialEventCount);
    });
  });

  describe('Background Task', () => {
    it('should run background task', async () => {
      const taskCalled = vi.fn();
      const task = vi.fn().mockImplementation((signal: AbortSignal) => {
        taskCalled();
        // Task completes synchronously
      });
      
      agent.runBackgroundTask(task as any);

      await delay(100);

      expect(task).toHaveBeenCalled();
      expect(taskCalled).toHaveBeenCalled();
    });

    it('should handle background task errors', async () => {
      const errorMessageSpy = vi.spyOn(agent, 'errorMessage').mockImplementation(() => {});
      
      const task = vi.fn().mockImplementation((signal: AbortSignal) => {
        throw new Error('Background task failed');
      });
      
      agent.runBackgroundTask(task as any);

      await delay(100);

      expect(errorMessageSpy).toHaveBeenCalled();
    });
  });

  describe('Artifact Output', () => {
    it('should output artifacts', () => {
      agent.artifactOutput({
        name: 'test-artifact',
        encoding: 'utf-8',
        mimeType: 'text/plain',
        body: 'artifact content'
      });
      
      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: 'output.artifact',
        name: 'test-artifact',
      });
    });
  });

  describe('Send Interaction Response', () => {
    it('should send interaction response', () => {
      // Setup: need an input item in the queue with a callback
      const resolveCallback = vi.fn();
      agent.mutateState(AgentEventState, (state) => {
        state.inputQueue.push({
          request: {
            type: 'input.received',
            requestId: 'test-request',
            timestamp: Date.now(),
            input: { from: 'test', message: 'test' }
          },
          executionState: {
            status: 'running',
            currentActivity: 'test',
            availableInteractions: []
          },
          interactionCallbacks: new Map([['test-interaction', resolveCallback]]),
          abortController: new AbortController()
        });
        state.currentlyExecutingInputItem = state.inputQueue[0];
      });

      agent.sendInteractionResponse({
        requestId: 'test-request',
        interactionId: 'test-interaction',
        result: 'test-result'
      });
      
      const eventState = agent.getState(AgentEventState);
      const lastEvent = eventState.events.find(e => e.type === 'input.interaction');
      expect(lastEvent).toBeDefined();
      expect(lastEvent!.type).toBe('input.interaction');
      expect(lastEvent!.requestId).toBe('test-request');
      expect(resolveCallback).toHaveBeenCalledWith('test-result');
    });
  });
});
