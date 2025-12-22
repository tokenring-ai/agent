import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentEventState } from '../../state/agentEventState.ts';
import { AgentEventEnvelope } from '../../AgentEvents.js';

// Mock data
const mockEvent: AgentEventEnvelope = {
  type: 'input.received',
  message: 'test message',
  requestId: 'test-id',
  timestamp: Date.now(),
};

const mockBusyEvent: AgentEventEnvelope = {
  type: 'output.system',
  message: 'Processing...',
  level: 'info' as const,
  timestamp: Date.now(),
};

describe('AgentEventState', () => {
  let state: AgentEventState;

  beforeEach(() => {
    state = new AgentEventState({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default values', () => {
      expect(state.busyWith).toBeNull();
      expect(state.events).toEqual([]);
      expect(state.inputQueue).toEqual([]);
      expect(state.currentlyExecuting).toBeNull();
    });

    it('should initialize with provided values', () => {
      const stateWithValues = new AgentEventState({
        events: [mockEvent],
        busyWith: 'Processing',
      });

      expect(stateWithValues.events).toHaveLength(1);
      expect(stateWithValues.busyWith).toBe('Processing');
    });

    it('should have correct name', () => {
      expect(state.name).toBe('AgentEventState');
    });
  });

  describe('Idle State', () => {
    it('should be idle when input queue is empty', () => {
      expect(state.idle).toBe(true);
    });

    it('should not be idle when input queue has items', () => {
      const inputEvent = {
        type: 'input.received',
        message: 'test',
        requestId: 'test-id',
        timestamp: Date.now(),
      };

      state['inputQueue'].push(inputEvent);
      expect(state.idle).toBe(false);
    });

    it('should be idle when input queue is cleared', () => {
      state['inputQueue'].push({
        type: 'input.received',
        content: 'test',
        requestId: 'test-id',
        timestamp: Date.now(),
      });

      expect(state.idle).toBe(false);

      state['inputQueue'] = [];
      expect(state.idle).toBe(true);
    });
  });

  describe('Event Emission', () => {
    it('should emit events correctly', () => {
      state.emit(mockEvent);

      expect(state.events).toHaveLength(1);
      expect(state.events[0]).toBe(mockEvent);
    });

    it('should emit multiple events', () => {
      const event2 = {
        type: 'output.chat',
        content: 'message',
        timestamp: Date.now(),
      };

      state.emit(mockEvent);
      state.emit(event2);

      expect(state.events).toHaveLength(2);
      expect(state.events[0]).toBe(mockEvent);
      expect(state.events[1]).toBe(event2);
    });
  });

  describe('Reset Functionality', () => {
    it('should handle reset calls', () => {
      state.emit(mockEvent);
      state.busyWith = 'Processing';

      // Reset method exists but doesn't actually reset anything
      state.reset(['events']);

      expect(state.events).toHaveLength(1);
      expect(state.busyWith).toBe('Processing');
    });
  });

  describe('Serialization', () => {
    it('should serialize with events and busyWith', () => {
      state.emit(mockEvent);
      state.busyWith = 'Processing';

      const serialized = state.serialize();

      expect(serialized).toMatchObject({
        events: [mockEvent],
        busyWith: 'Processing',
        idle: true,
      });
    });

    it('should serialize with empty state', () => {
      const serialized = state.serialize();

      expect(serialized).toMatchObject({
        events: [],
        busyWith: null,
        idle: true,
      });
    });

    it('should serialize with busy state', () => {
      const busyState = new AgentEventState({ busyWith: 'Working' });
      const serialized = busyState.serialize();

      expect(serialized).toMatchObject({
        events: [],
        busyWith: 'Working',
        idle: true,
      });
    });
  });

  describe('Deserialization', () => {
    it('should deserialize events and busyWith', () => {
      const data = {
        events: [mockEvent],
        busyWith: 'Restored',
      };

      state.deserialize(data);

      expect(state.events).toHaveLength(1);
      expect(state.events[0]).toEqual(mockEvent);
      expect(state.busyWith).toBe('Restored');
    });

    it('should handle missing fields', () => {
      const partialData = {
        events: [],
      };

      state.deserialize(partialData);

      expect(state.events).toHaveLength(0);
      expect(state.busyWith).toBeNull();
    });

    it('should handle null events', () => {
      const nullData = {
        events: null,
        busyWith: null,
      };

      state.deserialize(nullData);

      expect(state.events).toHaveLength(0);
      expect(state.busyWith).toBeNull();
    });

    it('should copy events array', () => {
      const data = {
        events: [mockEvent],
        busyWith: null,
      };

      state.deserialize(data);

      // Modify original array
      data.events.push({
        type: 'output.chat',
        content: 'new message',
        timestamp: Date.now(),
      });

      // State should not be affected
      expect(state.events).toHaveLength(1);
    });
  });

  describe('Display', () => {
    it('should show event information', () => {
      state.emit(mockEvent);
      state.busyWith = 'Processing';

      const display = state.show();

      expect(display).toContain('Events: 1');
      expect(display).toContain('Busy With: Processing');
      expect(display).toContain('Idle: Yes');
    });

  });

  describe('Event Cursor', () => {
    let cursor: any;

    beforeEach(() => {
      cursor = state.getEventCursorFromCurrentPosition();
    });

    it('should create cursor at current position', () => {
      expect(cursor.position).toBe(0);
    });

    it('should yield events from cursor position', () => {
      state.emit(mockEvent);
      state.emit({
        type: 'output.chat',
        content: 'message',
        timestamp: Date.now(),
      });

      const events = Array.from(state.yieldEventsByCursor(cursor));

      expect(events).toHaveLength(2);
      expect(events[0]).toBe(mockEvent);
    });

    it('should advance cursor position', () => {
      state.emit(mockEvent);

      const events1 = Array.from(state.yieldEventsByCursor(cursor));
      expect(events1).toHaveLength(1);

      // Add another event
      state.emit({
        type: 'output.chat',
        content: 'message',
        timestamp: Date.now(),
      });

      const events2 = Array.from(state.yieldEventsByCursor(cursor));
      expect(events2).toHaveLength(1); // Should only get new events
      expect(cursor.position).toBe(2);
    });

    it('should handle empty state', () => {
      const events = Array.from(state.yieldEventsByCursor(cursor));
      expect(events).toHaveLength(0);
      expect(cursor.position).toBe(0);
    });
  });

  describe('Input Queue Management', () => {
    it('should manage input queue', () => {
      const inputEvent = {
        type: 'input.received',
        message: 'test',
        requestId: 'test-id',
        timestamp: Date.now(),
      };

      state['inputQueue'].push(inputEvent);

      expect(state.inputQueue).toHaveLength(1);
      expect(state.inputQueue[0]).toEqual(inputEvent);
    });

    it('should clear input queue', () => {
      state['inputQueue'].push({
        type: 'input.received',
        content: 'test',
        requestId: 'test-id',
        timestamp: Date.now(),
      });

      state['inputQueue'] = [];

      expect(state.inputQueue).toHaveLength(0);
    });
  });

  describe('Currently Executing', () => {
    it('should manage currently executing state', () => {
      const execState = {
        requestId: 'exec-id',
        abortController: new AbortController(),
      };

      state['currentlyExecuting'] = execState;

      expect(state.currentlyExecuting).toEqual(execState);
    });

    it('should clear currently executing', () => {
      state['currentlyExecuting'] = {
        requestId: 'exec-id',
        abortController: new AbortController(),
      };

      state['currentlyExecuting'] = null;

      expect(state.currentlyExecuting).toBeNull();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle complex event flow', () => {
      // Add busy state
      state.busyWith = 'Processing';
      
      // Add events
      state.emit({
        type: 'input.received',
        message: 'start',
        requestId: 'id1',
        timestamp: Date.now(),
      });

      state.emit({
        type: 'output.chat',
        content: 'response',
        timestamp: Date.now(),
      });

      state.emit({
        type: 'input.received',
        message: 'continue',
        requestId: 'id2',
        timestamp: Date.now(),
      });

      // Set executing state
      state['currentlyExecuting'] = {
        requestId: 'id2',
        abortController: new AbortController(),
      };

      const serialized = state.serialize();
      expect(serialized.events).toHaveLength(3);
      expect(serialized.busyWith).toBe('Processing');
      expect(serialized.idle).toBe(true);

      const display = state.show();
      expect(display).toContain('Events: 3');
    });

    it('should handle event state transitions', () => {
      // Initial state
      expect(state.idle).toBe(true);

      // Add input
      state['inputQueue'].push({
        type: 'input.received',
        content: 'test',
        requestId: 'test-id',
        timestamp: Date.now(),
      });

      expect(state.idle).toBe(false);

      // Process input (simulate)
      state['currentlyExecuting'] = {
        requestId: 'test-id',
        abortController: new AbortController(),
      };

      expect(state.idle).toBe(false);

      // Complete processing
      state['currentlyExecuting'] = null;
      state['inputQueue'] = [];

      expect(state.idle).toBe(true);
    });
  });
});