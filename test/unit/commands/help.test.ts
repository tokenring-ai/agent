import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import helpCommand from '../../../commands/help.ts';
import AgentCommandService from '../../../services/AgentCommandService.ts';

// Mock agent
const createMockAgent = () => ({
  requireServiceByType: vi.fn(),
  getServiceByType: vi.fn(),
  chatOutput: vi.fn(),
  infoMessage: vi.fn(),
  systemMessage: vi.fn(),
  errorMessage: vi.fn(),
  debugMessage: vi.fn(),
} as any);

describe('Help Command', () => {
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
      expect(helpCommand.description).toBe('/help - Show this help message');
    });

    it('should have help text', () => {
      expect(helpCommand.help).toContain('# /help');
      expect(helpCommand.help).toContain('Displays help information');
      expect(helpCommand.help).toContain('Usage');
      expect(helpCommand.help).toContain('Examples');
    });

    it('should satisfy TokenRingAgentCommand interface', () => {
      expect(helpCommand).toHaveProperty('description');
      expect(helpCommand).toHaveProperty('execute');
      expect(helpCommand).toHaveProperty('help');
      expect(typeof helpCommand.execute).toBe('function');
    });
  });

  describe('Command Execution', () => {
    it('should show general help when no specific command requested', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockReturnValue({
          'test': {
            description: 'Test command',
            help: 'Test help',
            execute: vi.fn(),
          },
          'other': {
            description: 'Other command',
            help: 'Other help',
            execute: vi.fn(),
          },
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute(undefined, mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalled();
      const output = mockAgent.chatOutput.mock.calls[0][0];
      
      expect(output).toContain('**Available chat commands:**');
      expect(output).toContain('- Test command');
      expect(output).toContain('- Other command');
      expect(output).toContain('Use /help <command> to get detailed help');
    });

    it('should show specific command help', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockReturnValue({
          description: 'Test command',
          help: '# Test Command\n\nDetailed help for test command.',
          execute: vi.fn(),
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute('test', mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalledWith(
        '# Test Command\n\nDetailed help for test command.'
      );
    });

    it('should handle non-existent command help', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockReturnValue(null),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute('nonexistent', mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalledWith(
        'No help available for command /nonexistent'
      );
    });

    it('should handle command help with multiple words', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockImplementation((name: string) => {
          if (name === 'multi word') {
            return {
              description: 'Multi word command',
              help: '# Multi Word Command\n\nHelp for multi word command.',
              execute: vi.fn(),
            };
          }
          return null;
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute('multi word', mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalledWith(
        '# Multi Word Command\n\nHelp for multi word command.'
      );
    });
  });

  describe('Help Content Structure', () => {
    it('should include proper markdown formatting', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockReturnValue({
          'basic': {
            description: 'Basic command description',
            help: '# Basic Command\n\n## Description\nBasic command help.\n\n## Usage\n/basic\n\n## Examples\n/basic arg1 arg2',
            execute: vi.fn(),
          },
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute(undefined, mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalled();
      const output = mockAgent.chatOutput.mock.calls[0][0];
      
      expect(output).toContain('**Available chat commands:**');
      expect(output).toContain('- Basic command description');
      expect(output).toContain('Use /help <command> to get detailed help');
    });

    it('should handle empty commands list', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockReturnValue({}),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute(undefined, mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalled();
      const output = mockAgent.chatOutput.mock.calls[0][0];
      
      expect(output).toContain('**Available chat commands:**');
      expect(output).toContain('Use /help <command> to get detailed help');
    });

    it('should handle commands with special characters', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockReturnValue({
          'test-command': {
            description: 'Test command with dash',
            help: '# Test Command\n\nHelp for test command.',
            execute: vi.fn(),
          },
          'test_command': {
            description: 'Test command with underscore',
            help: '# Test Command\n\nHelp for test command.',
            execute: vi.fn(),
          },
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute(undefined, mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalled();
      const output = mockAgent.chatOutput.mock.calls[0][0];
      
      expect(output).toContain('- Test command with dash');
      expect(output).toContain('- Test command with underscore');
    });
  });

  describe('Error Handling', () => {
    it('should handle service resolution errors', async () => {
      mockAgent.requireServiceByType.mockImplementation(() => {
        throw new Error('Service not found');
      });

      await expect(helpCommand.execute(undefined, mockAgent)).rejects.toThrow();
    });

    it('should handle command service errors', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockImplementation(() => {
          throw new Error('Failed to get commands');
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await expect(helpCommand.execute(undefined, mockAgent)).rejects.toThrow();
    });

    it('should handle get command errors', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockImplementation(() => {
          throw new Error('Failed to get command');
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await expect(helpCommand.execute('test', mockAgent)).rejects.toThrow();
    });
  });

  describe('Integration with Agent Interface', () => {
    it('should use agent methods correctly', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockReturnValue({
          'test': {
            description: 'Test command',
            help: 'Test help',
            execute: vi.fn(),
          },
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute(undefined, mockAgent);

      expect(mockAgent.requireServiceByType).toHaveBeenCalledWith(AgentCommandService);
      expect(mockAgent.chatOutput).toHaveBeenCalled();
    });

    it('should handle chat output formatting', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockReturnValue({
          'alpha': {
            description: 'Alpha command',
            help: 'Alpha help',
            execute: vi.fn(),
          },
          'beta': {
            description: 'Beta command',
            help: 'Beta help',
            execute: vi.fn(),
          },
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute(undefined, mockAgent);

      const output = mockAgent.chatOutput.mock.calls[0][0];
      
      // Commands should be sorted
      const lines = output.split('\n');
      const commandLines = lines.filter(line => line.startsWith('- '));
      
      expect(commandLines[0]).toContain('Alpha command');
      expect(commandLines[1]).toContain('Beta command');
    });
  });

  describe('Help Command Features', () => {
    it('should show comprehensive usage instructions', async () => {
      const mockCommandService = {
        getCommands: vi.fn().mockReturnValue({}),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute(undefined, mockAgent);

      const output = mockAgent.chatOutput.mock.calls[0][0];

      expect(output).toContain('Use /help <command> to get detailed help for a specific command.');
    });

    it('should provide detailed help examples', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockReturnValue({
          description: 'Multi command',
          help: `# Multi Command

## Description
A command with multiple features.

## Usage
/multi option1 value1
/multi option2 value2

## Examples
/multi start process
/multi stop process

## Notes
Additional notes about usage.`,
          execute: vi.fn(),
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute('multi', mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalledWith(
        `# Multi Command

## Description
A command with multiple features.

## Usage
/multi option1 value1
/multi option2 value2

## Examples
/multi start process
/multi stop process

## Notes
Additional notes about usage.`
      );
    });
  });
});