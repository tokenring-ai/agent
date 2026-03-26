import {AfterAgentInputSuccess} from "@tokenring-ai/lifecycle/util/hooks";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import todoCompletionCheckHook from './todoCompletionCheck.ts';

// Mock Agent
const createMockAgent = () => ({
  getState: vi.fn(),
  mutateState: vi.fn(),
  infoMessage: vi.fn(),
  errorMessage: vi.fn(),
  askQuestion: vi.fn(),
  handleInput: vi.fn(),
  id: 'test-agent-id',
  config: { 
    agentType: 'test-agent-type',
    todos: {
      copyToChild: true,
      initialItems: [],
    }
  }
} as any);

describe('Todo Completion Check Hook', () => {
  let mockAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent = createMockAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Hook Configuration', () => {
    it('should export correct name and description', () => {
      expect(todoCompletionCheckHook.name).toBe('todoCompletionCheck');
      expect(todoCompletionCheckHook.displayName).toBe('Todo/Completion Check');
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

    it('should have callback for AfterAgentInputSuccess', () => {
      const callback = todoCompletionCheckHook.callbacks[0];
      expect(callback).toBeDefined();
      expect(callback.hookConstructor).toBe(AfterAgentInputSuccess);
    });
  });

  describe('Hook Execution - No Todos', () => {
    it('should do nothing when no todos exist', async () => {
      mockAgent.getState.mockReturnValue({ todos: [] });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).not.toHaveBeenCalled();
      expect(mockAgent.handleInput).not.toHaveBeenCalled();
    });

    it('should do nothing when todos state is null', async () => {
      mockAgent.getState.mockReturnValue(null);
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).not.toHaveBeenCalled();
      expect(mockAgent.handleInput).not.toHaveBeenCalled();
    });

    it('should do nothing when todos is undefined', async () => {
      mockAgent.getState.mockReturnValue(undefined);
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.infoMessage).not.toHaveBeenCalled();
      expect(mockAgent.handleInput).not.toHaveBeenCalled();
    });
  });

  describe('Hook Execution - All Todos Complete', () => {
    it('should not notify when all todos are completed', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Task 1', status: 'completed' },
          { id: '2', content: 'Task 2', status: 'completed' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      // The infoMessage call for "All todos completed" is commented out in implementation
      expect(mockAgent.infoMessage).not.toHaveBeenCalled();
      expect(mockAgent.handleInput).not.toHaveBeenCalled();
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
      
      expect(mockAgent.handleInput).toHaveBeenCalled();
      const message = mockAgent.handleInput.mock.calls[0][0].message;
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
      
      expect(mockAgent.handleInput).toHaveBeenCalled();
      const message = mockAgent.handleInput.mock.calls[0][0].message;
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
      
      expect(mockAgent.handleInput).toHaveBeenCalled();
      const message = mockAgent.handleInput.mock.calls[0][0].message;
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
      
      const message = mockAgent.handleInput.mock.calls[0][0].message;
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
      
      const message = mockAgent.handleInput.mock.calls[0][0].message;
      expect(message).toContain('🔄');
    });

    it('should include instruction to complete tasks', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Task 1', status: 'pending' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      const message = mockAgent.handleInput.mock.calls[0][0].message;
      expect(message).toContain('Please complete the remaining tasks on your todo list.');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty todos array', async () => {
      mockAgent.getState.mockReturnValue({ todos: [] });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.handleInput).not.toHaveBeenCalled();
    });

    it('should handle todos with only completed items', async () => {
      mockAgent.getState.mockReturnValue({
        todos: [
          { id: '1', content: 'Task 1', status: 'completed' },
          { id: '2', content: 'Task 2', status: 'completed' },
          { id: '3', content: 'Task 3', status: 'completed' }
        ]
      });
      
      const hook = todoCompletionCheckHook.callbacks[0];
      await hook.callback(new AfterAgentInputSuccess({} as any, {} as any), mockAgent);
      
      expect(mockAgent.handleInput).not.toHaveBeenCalled();
    });
  });
});
