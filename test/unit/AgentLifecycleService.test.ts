import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Agent from "../../Agent";
import AgentLifecycleService from '../../services/AgentLifecycleService.ts';
import {HooksState} from '../../state/hooksState.js';
import type {HookConfig, HookType} from '../../types.js';
import createTestingAgent from "../createTestingAgent";

const app = createTestingApp();
app.addServices(new AgentLifecycleService())

// Create a mock agent
const createMockAgent = () => {
  const agent = createTestingAgent(app);

  vi.spyOn(agent, 'requireServiceByType');
  vi.spyOn(agent, 'chatOutput');
  vi.spyOn(agent, 'infoMessage');
  vi.spyOn(agent, 'errorMessage');

  return agent;
};

const mockHook: HookConfig = {
  name: 'test-hook',
  displayName: "Test Hook",
  description: 'A test hook',
  afterChatCompletion: vi.fn(),
  afterTesting: vi.fn(),
};

const anotherHook: HookConfig = {
  name: 'another-hook',
  displayName: "Test Hook 2",
  description: 'Another test hook',
  afterChatCompletion: vi.fn(),
  afterAgentInputComplete: vi.fn(),
};

describe('AgentLifecycleService', () => {
  let service: AgentLifecycleService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentLifecycleService();
    
    service.registerHook('test', mockHook);
    service.registerHook('another', anotherHook);
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
      const hooks = service.getRegisteredHooks();
      expect(hooks).toHaveProperty('test');
      expect(hooks).toHaveProperty('another');
    });

    it('should add multiple hooks', () => {
      service.addHooks('package', {
        'hook1': mockHook,
        'hook2': anotherHook,
      });

      const hooks = service.getRegisteredHooks();
      expect(hooks).toHaveProperty('package/hook1');
      expect(hooks).toHaveProperty('package/hook2');
    });

    it('should throw error for non-existent hooks when ensuring', () => {
      expect(() => service['hooks'].ensureItems(['non-existent'])).toThrow();
    });
  });

  describe('Hook Management', () => {
    let mockAgent!: Agent;
    beforeEach(() => {
      mockAgent = createMockAgent();
    });

    it('should get enabled hooks', () => {
      service.setEnabledHooks(['test'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toEqual(['test']);
    });

    it('should set enabled hooks', () => {
      vi.spyOn(mockAgent, 'mutateState');
      service.setEnabledHooks(['test', 'another'], mockAgent);
      
      expect(mockAgent.mutateState).toHaveBeenCalledWith(HooksState, expect.any(Function));
    });

    it('should enable additional hooks', () => {
      service.setEnabledHooks(['test'], mockAgent);

      service.enableHooks(['another'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toContain('test');
      expect(enabledHooks).toContain('another');
    });

    it('should disable hooks', () => {
      service.setEnabledHooks(['test', 'another'], mockAgent);

      service.disableHooks(['test'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toEqual(['another']);
    });

    it('should not duplicate enabled hooks', () => {
      service.setEnabledHooks(['test'], mockAgent);

      service.enableHooks(['test'], mockAgent);
      
      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks.filter(hook => hook === 'test')).toHaveLength(1);
    });
  });

  describe('Hook Execution', () => {
    let mockAgent!: Agent;
    beforeEach(() => {
      mockAgent = createMockAgent();
    });

    it('should execute hooks after chat completion', async () => {
      service.setEnabledHooks(['test'], mockAgent);
      await service.executeHooks(mockAgent, 'afterChatCompletion', 'test args');
      
      expect(mockHook.afterChatCompletion).toHaveBeenCalledWith(mockAgent, 'test args');
      expect(anotherHook.afterChatCompletion).not.toHaveBeenCalled();
    });

    it('should execute hooks after testing', async () => {
      service.setEnabledHooks(['test'], mockAgent);
      await service.executeHooks(mockAgent, 'afterTesting');
      
      expect(mockHook.afterTesting).toHaveBeenCalledWith(mockAgent);
    });

    it('should execute hooks after agent input complete', async () => {
      service.setEnabledHooks(['another'], mockAgent);
      await service.executeHooks(mockAgent, 'afterAgentInputComplete', 'input');
      
      expect(anotherHook.afterAgentInputComplete).toHaveBeenCalledWith(mockAgent, 'input');
    });

    it('should handle hooks with missing callback types', async () => {
      const partialHook: HookConfig = {
        name: 'partial',
        description: 'Partial hook',
        afterChatCompletion: vi.fn(),
      };

      service.registerHook('partial', partialHook);
      service.setEnabledHooks(['test', 'partial'], mockAgent);
      
      await service.executeHooks(mockAgent, 'afterChatCompletion');
      
      expect(mockHook.afterChatCompletion).toHaveBeenCalledWith(mockAgent);
      expect(partialHook.afterChatCompletion).toHaveBeenCalledWith(mockAgent);
    });

    it('should execute all enabled hooks of the specified type', async () => {
      const hook1: HookConfig = {
        name: 'hook1',
        description: 'Hook 1',
        afterChatCompletion: vi.fn(),
      };

      const hook2: HookConfig = {
        name: 'hook2',
        description: 'Hook 2',
        afterChatCompletion: vi.fn(),
      };

      service.registerHook('hook1', hook1);
      service.registerHook('hook2', hook2);
      service.setEnabledHooks(['test', 'hook1', 'hook2'], mockAgent);
      
      await service.executeHooks(mockAgent, 'afterChatCompletion');
      
      expect(mockHook.afterChatCompletion).toHaveBeenCalledWith(mockAgent);
      expect(hook1.afterChatCompletion).toHaveBeenCalledWith(mockAgent);
      expect(hook2.afterChatCompletion).toHaveBeenCalledWith(mockAgent);
    });

    it('should handle hook execution errors gracefully', async () => {
      const errorHook: HookConfig = {
        name: 'error',
        description: 'Error hook',
        afterChatCompletion: vi.fn().mockRejectedValue(new Error('Hook failed')),
      };

      service.registerHook('error', errorHook);
      service.setEnabledHooks(['test', 'error'], mockAgent);
      
      await expect(service.executeHooks(mockAgent, 'afterChatCompletion')).rejects.toThrow();
      
      expect(mockHook.afterChatCompletion).toHaveBeenCalledWith(mockAgent);
      expect(errorHook.afterChatCompletion).toHaveBeenCalledWith(mockAgent);
    });
  });

  describe('Hook Types', () => {
    it('should handle all hook types', () => {
      const allHookTypes: HookType[] = [
        'afterChatCompletion',
        'beforeChatCompletion',
        'afterAgentInputComplete',
      ];

      allHookTypes.forEach(type => {
        const hook: HookConfig = {
          name: type,
          description: `${type} hook`,
        };
        service.registerHook(type, hook);
      });

      const hooks = service.getRegisteredHooks();
      expect(hooks).toHaveProperty('afterChatCompletion');
      expect(hooks).toHaveProperty('beforeChatCompletion');
      expect(hooks).toHaveProperty('afterAgentInputComplete');
    });
  });


  describe('Edge Cases', () => {
    it('should handle empty hook list', () => {
      const mockAgent = createMockAgent();

      const enabledHooks = service.getEnabledHooks(mockAgent);
      expect(enabledHooks).toEqual([]);
    });

  });
});