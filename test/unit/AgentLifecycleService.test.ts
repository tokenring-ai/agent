import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import AgentLifecycleService from '@tokenring-ai/lifecycle/AgentLifecycleService';
import {LifecycleState} from '@tokenring-ai/lifecycle/state/lifecycleState';
import type {HookSubscription} from '@tokenring-ai/lifecycle/types';
import {AfterAgentInputSuccess, BeforeAgentInput, HookCallback} from '@tokenring-ai/lifecycle/util/hooks';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Agent from "../../Agent";
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

const mockHook: HookSubscription = {
  name: 'test-hook',
  displayName: 'Test Hook',
  description: 'A test hook',
  callbacks: [
    new HookCallback(AfterAgentInputSuccess, vi.fn()),
    new HookCallback(BeforeAgentInput, vi.fn()),
  ],
};

const anotherHook: HookSubscription = {
  name: 'another-hook',
  displayName: 'Test Hook 2',
  description: 'Another test hook',
  callbacks: [
    new HookCallback(AfterAgentInputSuccess, vi.fn()),
  ],
};

describe('AgentLifecycleService', () => {
  let service: AgentLifecycleService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentLifecycleService({
      agentDefaults: {
        enabledHooks: [],
      }
    });
    
    service.registerHook('test-hook', mockHook);
    service.registerHook('another-hook', anotherHook);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Properties', () => {
    it('should have correct name and description', () => {
      expect(service.name).toBe('AgentLifecycleService');
      expect(service.description).toBe('A service which dispatches hooks when certain agent lifecycle event happen.');
    });
  });

  describe('Hook Registration', () => {
    it('should register hooks correctly', () => {
      const hookNames = service.getAllHookNames();
      expect(hookNames).toContain('test-hook');
      expect(hookNames).toContain('another-hook');
    });

    it('should add multiple hooks', () => {
      service.addHooks({
        'hook1': mockHook,
        'hook2': anotherHook,
      });

      const hookNames = service.getAllHookNames();
      expect(hookNames).toContain('hook1');
      expect(hookNames).toContain('hook2');
    });

    it('should get hook entries', () => {
      const entries = Array.from(service.getAllHookEntries());
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['test-hook']),
          expect.arrayContaining(['another-hook']),
        ])
      );
    });
  });

  describe('Hook Management', () => {
    let mockAgent: Agent;
    beforeEach(() => {
      mockAgent = createMockAgent();
      // Attach service to agent to initialize state
      service.attach(mockAgent);
    });

    it('should get enabled hooks', () => {
      service.setEnabledHooks(['test-hook'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toEqual(['test-hook']);
    });

    it('should set enabled hooks', () => {
      vi.spyOn(mockAgent, 'mutateState');
      service.setEnabledHooks(['test-hook', 'another-hook'], mockAgent);
      
      expect(mockAgent.mutateState).toHaveBeenCalledWith(LifecycleState, expect.any(Function));
    });

    it('should enable additional hooks', () => {
      service.setEnabledHooks(['test-hook'], mockAgent);
      service.enableHooks(['another-hook'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toContain('test-hook');
      expect(enabledHooks).toContain('another-hook');
    });

    it('should disable hooks', () => {
      service.setEnabledHooks(['test-hook', 'another-hook'], mockAgent);
      service.disableHooks(['test-hook'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toEqual(['another-hook']);
    });

    it('should not duplicate enabled hooks', () => {
      service.setEnabledHooks(['test-hook'], mockAgent);
      service.enableHooks(['test-hook'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks.filter(hook => hook === 'test-hook')).toHaveLength(1);
    });
  });

  describe('Hook Execution', () => {
    let mockAgent: Agent;
    beforeEach(() => {
      mockAgent = createMockAgent();
      service.attach(mockAgent);
    });

    it('should execute hooks after agent input success', async () => {
      service.setEnabledHooks(['test-hook'], mockAgent);
      
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test message' }
      };
      
      const responseData = {
        type: 'agent.response' as const,
        timestamp: Date.now(),
        requestId: 'test-request',
        status: 'success',
        message: 'success',
      };

      await service.executeHooks(new AfterAgentInputSuccess(requestData, responseData), mockAgent);
      
      const callback = mockHook.callbacks.find(c => c.hookConstructor === AfterAgentInputSuccess);
      expect(callback?.callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        mockAgent
      );
    });

    it('should execute hooks before agent input', async () => {
      service.setEnabledHooks(['test-hook'], mockAgent);
      
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test message' }
      };

      await service.executeHooks(new BeforeAgentInput(requestData), mockAgent);
      
      const callback = mockHook.callbacks.find(c => c.hookConstructor === BeforeAgentInput);
      expect(callback?.callback).toHaveBeenCalledWith(
        expect.any(BeforeAgentInput),
        mockAgent
      );
    });

    it('should execute hooks after agent input handled', async () => {
      const handledHook: HookSubscription = {
        name: 'handled-hook',
        displayName: 'Handled Hook',
        description: 'A hook for handled input',
        callbacks: [
          new HookCallback(AfterAgentInputSuccess, vi.fn()),
        ],
      };
      service.registerHook('handled-hook', handledHook);
      
      service.setEnabledHooks(['handled-hook'], mockAgent);
      
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test message' }
      };
      
      const responseData = {
        type: 'agent.response' as const,
        timestamp: Date.now(),
        requestId: 'test-request',
        status: 'success',
        message: 'success',
      };

      await service.executeHooks(new AfterAgentInputSuccess(requestData, responseData), mockAgent);
      
      const callback = handledHook.callbacks[0];
      expect(callback.callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        mockAgent
      );
    });

    it('should handle hooks with missing callback types', async () => {
      const partialHook: HookSubscription = {
        name: 'partial',
        displayName: 'Partial Hook',
        description: 'Partial hook',
        callbacks: [
          new HookCallback(AfterAgentInputSuccess, vi.fn()),
        ],
      };

      service.registerHook('partial', partialHook);
      service.setEnabledHooks(['test-hook', 'partial'], mockAgent);
      
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test message' }
      };
      
      const responseData = {
        type: 'agent.response' as const,
        timestamp: Date.now(),
        requestId: 'test-request',
        status: 'success',
        message: 'success',
      };

      await service.executeHooks(new AfterAgentInputSuccess(requestData, responseData), mockAgent);
      
      const testCallback = mockHook.callbacks.find(c => c.hookConstructor === AfterAgentInputSuccess);
      const partialCallback = partialHook.callbacks[0];
      
      expect(testCallback?.callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        mockAgent
      );
      expect(partialCallback.callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        mockAgent
      );
    });

    it('should execute all enabled hooks of the specified type', async () => {
      const hook1: HookSubscription = {
        name: 'hook1',
        displayName: 'Hook 1',
        description: 'Hook 1',
        callbacks: [
          new HookCallback(AfterAgentInputSuccess, vi.fn()),
        ],
      };

      const hook2: HookSubscription = {
        name: 'hook2',
        displayName: 'Hook 2',
        description: 'Hook 2',
        callbacks: [
          new HookCallback(AfterAgentInputSuccess, vi.fn()),
        ],
      };

      service.registerHook('hook1', hook1);
      service.registerHook('hook2', hook2);
      service.setEnabledHooks(['test-hook', 'hook1', 'hook2'], mockAgent);
      
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test message' }
      };
      
      const responseData = {
        type: 'agent.response' as const,
        timestamp: Date.now(),
        requestId: 'test-request',
        status: 'success',
        message: 'success',
      };

      await service.executeHooks(new AfterAgentInputSuccess(requestData, responseData), mockAgent);
      
      const testCallback = mockHook.callbacks.find(c => c.hookConstructor === AfterAgentInputSuccess);
      expect(testCallback?.callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        mockAgent
      );
      expect(hook1.callbacks[0].callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        mockAgent
      );
      expect(hook2.callbacks[0].callback).toHaveBeenCalledWith(
        expect.any(AfterAgentInputSuccess),
        mockAgent
      );
    });

    it('should handle hook execution errors', async () => {
      const errorHook: HookSubscription = {
        name: 'error',
        displayName: 'Error Hook',
        description: 'Error hook',
        callbacks: [
          new HookCallback(AfterAgentInputSuccess, vi.fn().mockRejectedValue(new Error('Hook failed'))),
        ],
      };

      service.registerHook('error', errorHook);
      service.setEnabledHooks(['error'], mockAgent);
      
      const requestData = {
        type: 'input.received' as const,
        requestId: 'test-request',
        timestamp: Date.now(),
        input: { from: 'test', message: 'test message' }
      };
      
      const responseData = {
        type: 'agent.response' as const,
        timestamp: Date.now(),
        requestId: 'test-request',
        status: 'success',
        message: 'success',
      };

      await expect(service.executeHooks(new AfterAgentInputSuccess(requestData, responseData), mockAgent))
        .rejects.toThrow('Hook failed');
    });
  });

  describe('Hook Types', () => {
    it('should handle all hook types', () => {
      const hookTypes = [
        AfterAgentInputSuccess,
        BeforeAgentInput,
      ];

      hookTypes.forEach(HookType => {
        const hook: HookSubscription = {
          name: HookType.name,
          displayName: HookType.name,
          description: `${HookType.name} hook`,
          callbacks: [
            new HookCallback(HookType, vi.fn()),
          ],
        };
        service.registerHook(HookType.name, hook);
      });

      const hookNames = service.getAllHookNames();
      expect(hookNames).toContain(AfterAgentInputSuccess.name);
      expect(hookNames).toContain(BeforeAgentInput.name);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty hook list', () => {
      const mockAgent = createMockAgent();
      service.attach(mockAgent);

      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toEqual([]);
    });

    it('should handle non-existent hooks when enabling', () => {
      const mockAgent = createMockAgent();
      service.attach(mockAgent);
      
      // Should throw when trying to enable non-existent hook
      expect(() => service.setEnabledHooks(['non-existent'], mockAgent))
        .toThrow();
    });
  });
});
