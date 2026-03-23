import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import workCommand from '../../../commands/work.ts';
import AgentCommandService from '../../../services/AgentCommandService.ts';

// Mock agent
const createMockAgent = () => ({
  requireServiceByType: vi.fn(),
  getServiceByType: vi.fn(),
  infoMessage: vi.fn(),
  systemMessage: vi.fn(),
  errorMessage: vi.fn(),
  debugMessage: vi.fn(),
  config: {
    workHandler: null,
  },
} as any);

describe('Work_Command', () => {
  let mockAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent = createMockAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Properties', () => {
    it('should have correct description', () => {
      expect(workCommand.description).toBe('Runs the agents work handler with the message');
    });

    it('should have help text', () => {
      expect(workCommand.help).toContain('## Usage');
      expect(workCommand.help).toContain('## Notes');
      expect(workCommand.help).toContain('If the agent has a custom workHandler configured');
    });

    it('should satisfy TokenRingAgentCommand interface', () => {
      expect(workCommand).toHaveProperty('name');
      expect(workCommand).toHaveProperty('description');
      expect(workCommand).toHaveProperty('execute');
      expect(workCommand).toHaveProperty('help');
      expect(typeof workCommand.execute).toBe('function');
    });

    it('should have correct name', () => {
      expect(workCommand.name).toBe('work');
    });
  });

  describe('Command Execution with Work Handler', () => {
    it('should execute work handler when configured', async () => {
      const workHandler = vi.fn().mockResolvedValue('work completed');
      const agentWithHandler = {
        ...mockAgent,
        config: {
          workHandler,
        },
      };

      const result = await workCommand.execute({ remainder: 'test work message', agent: agentWithHandler });

      expect(workHandler).toHaveBeenCalledWith('test work message', agentWithHandler);
      expect(result).toBe('work completed');
    });

    it('should execute work handler with complex input', async () => {
      const workHandler = vi.fn().mockResolvedValue('completed');
      const agentWithHandler = {
        ...mockAgent,
        config: {
          workHandler,
        },
      };

      await workCommand.execute({ remainder: 'analyze data and create report', agent: agentWithHandler });

      expect(workHandler).toHaveBeenCalledWith('analyze data and create report', agentWithHandler);
    });

    it('should handle work handler errors', async () => {
      const workHandler = vi.fn().mockRejectedValue(new Error('Work failed'));
      const agentWithHandler = {
        ...mockAgent,
        config: {
          workHandler,
        },
      };

      await expect(workCommand.execute({ remainder: 'failing work', agent: agentWithHandler }))
        .rejects.toThrow('Work failed');
      expect(workHandler).toHaveBeenCalledWith('failing work', agentWithHandler);
    });

    it('should pass agent reference correctly', async () => {
      const workHandler = vi.fn();
      const agentWithHandler = {
        ...mockAgent,
        config: {
          workHandler,
        },
      };

      await workCommand.execute({ remainder: 'test work', agent: agentWithHandler });

      expect(workHandler).toHaveBeenCalledWith('test work', agentWithHandler);
    });

    it('should return string result from work handler', async () => {
      const workHandler = vi.fn().mockResolvedValue('custom result');
      const agentWithHandler = {
        ...mockAgent,
        config: {
          workHandler,
        },
      };

      const result = await workCommand.execute({ remainder: 'test work', agent: agentWithHandler });

      expect(result).toBe('custom result');
    });

    it('should return default message for non-string result', async () => {
      const workHandler = vi.fn().mockResolvedValue({ result: 'object' });
      const agentWithHandler = {
        ...mockAgent,
        config: {
          workHandler,
        },
      };

      const result = await workCommand.execute({ remainder: 'test work', agent: agentWithHandler });

      expect(result).toBe('Work completed successfully');
    });
  });

  describe('Command Execution without Work Handler', () => {
    it('should use command service when no work handler', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('command result'),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await workCommand.execute({ remainder: 'regular command message', agent: mockAgent });

      expect(mockAgent.requireServiceByType).toHaveBeenCalledWith(AgentCommandService);
      expect(mockCommandService.executeAgentCommand).toHaveBeenCalledWith(
        mockAgent,
        'regular command message'
      );
      expect(result).toBe('command result');
    });

    it('should handle complex command messages', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('result'),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await workCommand.execute({ remainder: 'complex message with multiple parts', agent: mockAgent });

      expect(mockCommandService.executeAgentCommand).toHaveBeenCalledWith(
        mockAgent,
        'complex message with multiple parts'
      );
    });

    it('should handle command service errors', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockRejectedValue(new Error('Command failed')),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await expect(workCommand.execute({ remainder: 'failing command', agent: mockAgent }))
        .rejects.toThrow('Command failed');
    });
  });

  describe('Input Validation', () => {
    it('should handle empty input', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('result'),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await workCommand.execute({ remainder: '', agent: mockAgent });

      // Empty input should still be passed to command service
      expect(mockCommandService.executeAgentCommand).toHaveBeenCalledWith(
        mockAgent,
        ''
      );
    });
  });

  describe('Work Handler vs Command Service Logic', () => {
    it('should prefer work handler over command service', async () => {
      const workHandler = vi.fn().mockResolvedValue('work done');
      const mockCommandService = {
        executeAgentCommand: vi.fn(),
      };

      const agentWithBoth = {
        ...mockAgent,
        config: {
          workHandler,
        },
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await workCommand.execute({ remainder: 'test message', agent: agentWithBoth });

      expect(workHandler).toHaveBeenCalledWith('test message', agentWithBoth);
      expect(mockCommandService.executeAgentCommand).not.toHaveBeenCalled();
    });

    it('should use command service when no work handler', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('result'),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await workCommand.execute({ remainder: 'test message', agent: mockAgent });

      expect(mockCommandService.executeAgentCommand).toHaveBeenCalledWith(
        mockAgent,
        'test message'
      );
    });

    it('should handle null work handler', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('result'),
      };

      const agentWithNull = {
        ...mockAgent,
        config: {
          workHandler: null,
        },
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await workCommand.execute({ remainder: 'test message', agent: agentWithNull });

      expect(mockCommandService.executeAgentCommand).toHaveBeenCalledWith(
        agentWithNull,
        'test message'
      );
    });

    it('should handle undefined work handler', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('result'),
      };

      const agentWithUndefined = {
        ...mockAgent,
        config: {
          workHandler: undefined,
        },
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await workCommand.execute({ remainder: 'test message', agent: agentWithUndefined });

      expect(mockCommandService.executeAgentCommand).toHaveBeenCalledWith(
        agentWithUndefined,
        'test message'
      );
    });
  });

  describe('Async Work Handler Scenarios', () => {
    it('should handle async work handler', async () => {
      const asyncWorkHandler = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async work completed';
      });

      const agentWithAsync = {
        ...mockAgent,
        config: {
          workHandler: asyncWorkHandler,
        },
      };

      const result = await workCommand.execute({ remainder: 'async work', agent: agentWithAsync });

      expect(result).toBe('async work completed');
      expect(asyncWorkHandler).toHaveBeenCalledWith('async work', agentWithAsync);
    });

    it('should handle sync work handler', async () => {
      const syncWorkHandler = vi.fn().mockReturnValue('sync work completed');

      const agentWithSync = {
        ...mockAgent,
        config: {
          workHandler: syncWorkHandler,
        },
      };

      const result = await workCommand.execute({ remainder: 'sync work', agent: agentWithSync });

      expect(result).toBe('sync work completed');
      expect(syncWorkHandler).toHaveBeenCalledWith('sync work', agentWithSync);
    });

    it('should handle work handler with no return value', async () => {
      const voidWorkHandler = vi.fn().mockReturnValue(undefined);

      const agentWithVoid = {
        ...mockAgent,
        config: {
          workHandler: voidWorkHandler,
        },
      };

      const result = await workCommand.execute({ remainder: 'void work', agent: agentWithVoid });

      expect(result).toBe('Work completed successfully');
      expect(voidWorkHandler).toHaveBeenCalledWith('void work', agentWithVoid);
    });
  });

  describe('Integration with Agent Interface', () => {
    it('should use requireServiceByType correctly', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('result'),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await workCommand.execute({ remainder: 'test message', agent: mockAgent });

      expect(mockAgent.requireServiceByType).toHaveBeenCalledWith(AgentCommandService);
    });

    it('should handle service resolution failures', async () => {
      mockAgent.requireServiceByType.mockImplementation(() => {
        throw new Error('Service not found');
      });

      await expect(workCommand.execute({ remainder: 'test message', agent: mockAgent }))
        .rejects.toThrow('Service not found');
    });
  });

  describe('Real-world Usage Scenarios', () => {
    it('should handle code analysis work', async () => {
      const analysisHandler = vi.fn().mockResolvedValue('analysis completed');
      const agentWithAnalysis = {
        ...mockAgent,
        config: {
          workHandler: analysisHandler,
        },
      };

      await workCommand.execute({ remainder: 'analyze this codebase for bugs', agent: agentWithAnalysis });

      expect(analysisHandler).toHaveBeenCalledWith('analyze this codebase for bugs', agentWithAnalysis);
    });

    it('should handle document generation work', async () => {
      const docHandler = vi.fn().mockResolvedValue('document generated');
      const agentWithDocs = {
        ...mockAgent,
        config: {
          workHandler: docHandler,
        },
      };

      await workCommand.execute({ remainder: 'create a technical specification document', agent: agentWithDocs });

      expect(docHandler).toHaveBeenCalledWith('create a technical specification document', agentWithDocs);
    });

    it('should handle data processing work', async () => {
      const dataHandler = vi.fn().mockResolvedValue('data processed');
      const agentWithData = {
        ...mockAgent,
        config: {
          workHandler: dataHandler,
        },
      };

      await workCommand.execute({ remainder: 'process the sales data and generate a report', agent: agentWithData });

      expect(dataHandler).toHaveBeenCalledWith('process the sales data and generate a report', agentWithData);
    });

    it('should handle general chat when no work handler configured', async () => {
      const mockCommandService = {
        executeAgentCommand: vi.fn().mockResolvedValue('chat result'),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await workCommand.execute({ remainder: 'general conversation about the weather', agent: mockAgent });

      expect(mockCommandService.executeAgentCommand).toHaveBeenCalledWith(
        mockAgent,
        'general conversation about the weather'
      );
      expect(result).toBe('chat result');
    });
  });
});
