import {AfterAgentInputSuccess} from "@tokenring-ai/lifecycle/util/hooks";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import todoCompletionCheckHook from './todoCompletionCheck.js';
import {TodoState} from "../state/todoState.js";

// Mock Agent
const mockAgent = {
  getState: vi.fn(),
  mutateState: vi.fn(),
  infoMessage: vi.fn(),
  errorMessage: vi.fn(),
  askQuestion: vi.fn(),
  id: 'test-agent-id',
  name: 'test-agent',
  config: { type: 'test-agent-type' }
} as any;

describe('Todo Completion Check Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Hook Configuration', () => {
    it('should export correct name and description', () => {
      expect(todoCompletionCheckHook.name).toBe('todoCompletionCheck');
      expect(todoCompletionCheckHook.description).toBe('Checks if todos are complete at the end of a successful chat and prompts to complete remaining work');
    });

    it('should implement HookSubscription interface', () => {
      const hook = todoCompletionCheckHook;
      expect(hook.name).toBeDefined();
      expect(hook.displayName).toBeDefined();
      expect(hook.description).toBeDefined();
      expect(hook.callbacks).toBeDefined();
      expect(hook.callbacks.length).toBeGreaterThan(0);
    });
  });

  describe('Hook Execution - No Todos', () => {
    it('should do nothing when no todos exist', async () => {
      mockAgent.getState.mockReturnValue({ todos: [] });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).not.toHaveBeenCalled();
    });

    it('should do nothing when todos state is null', async () => {
      mockAgent.getState.mockReturnValue(null);
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).not.toHaveBeenCalled();
    });
  });

  describe('Hook Execution - All Todos Complete', () => {
    it('should notify when all todos are completed', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Task 1', status: 'completed' },
          { id: '2', content: 'Task 2', status: 'completed' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).toHaveBeenCalledWith("✅ All todos completed!");
    });
  });

  describe('Hook Execution - Incomplete Todos', () => {
    it('should notify when todos are pending', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Task 1', status: 'pending' },
          { id: '2', content: 'Task 2', status: 'completed' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).toHaveBeenCalled();
      const message = mockAgent.infoMessage.mock.calls[0][0];
      expect(message).toContain('1 remaining task(s)');
      expect(message).toContain('1 pending');
      expect(message).toContain('Task 1');
    });

    it('should notify when todos are in_progress', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Task 1', status: 'in_progress' },
          { id: '2', content: 'Task 2', status: 'completed' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).toHaveBeenCalled();
      const message = mockAgent.infoMessage.mock.calls[0][0];
      expect(message).toContain('1 remaining task(s)');
      expect(message).toContain('1 in progress');
      expect(message).toContain('Task 1');
    });

    it('should handle multiple incomplete todos', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Task 1', status: 'pending' },
          { id: '2', content: 'Task 2', status: 'in_progress' },
          { id: '3', content: 'Task 3', status: 'pending' },
          { id: '4', content: 'Task 4', status: 'completed' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).toHaveBeenCalled();
      const message = mockAgent.infoMessage.mock.calls[0][0];
      expect(message).toContain('3 remaining task(s)');
      expect(message).toContain('2 pending');
      expect(message).toContain('1 in progress');
      expect(message).toContain('Task 1');
      expect(message).toContain('Task 2');
      expect(message).toContain('Task 3');
    });
  });

  describe('Message Formatting', () => {
    it('should format pending todos with correct emoji', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Pending task', status: 'pending' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      const message = mockAgent.infoMessage.mock.calls[0][0];
      expect(message).toContain('📝');
    });

    it('should format in_progress todos with correct emoji', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'In progress task', status: 'in_progress' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      const message = mockAgent.infoMessage.mock.calls[0][0];
      expect(message).toContain('🔄');
    });
  });
});
