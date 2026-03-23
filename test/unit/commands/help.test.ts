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

describe('Help_Command', () => {
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
      expect(helpCommand.description).toBe('Show this help message');
    });

    it('should have help text', () => {
      expect(helpCommand.help).toContain('## Output');
      expect(helpCommand.help).toContain('## Examples');
    });

    it('should satisfy TokenRingAgentCommand interface', () => {
      expect(helpCommand).toHaveProperty('name');
      expect(helpCommand).toHaveProperty('description');
      expect(helpCommand).toHaveProperty('execute');
      expect(helpCommand).toHaveProperty('help');
      expect(typeof helpCommand.execute).toBe('function');
    });

    it('should have correct name', () => {
      expect(helpCommand.name).toBe('help');
    });
  });

  describe('Command Execution', () => {
    it('should show general help when no specific command requested', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockReturnValue(new Map([
          ['test', {
            name: 'test',
            description: 'Test command',
            help: 'Test help',
            execute: vi.fn(),
          }],
          ['other', {
            name: 'other',
            description: 'Other command',
            help: 'Other help',
            execute: vi.fn(),
          }],
        ])),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: undefined, agent: mockAgent });

      expect(result).toContain('**Available chat commands:**');
      expect(result).toContain('- Test command');
      expect(result).toContain('- Other command');
      expect(result).toContain('Use /help <command> to get detailed help for a specific command.');
    });

    it('should show specific command help', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockReturnValue({
          name: 'test',
          description: 'Test command',
          help: '# Test Command\n\nDetailed help for test command.',
          execute: vi.fn(),
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: 'test', agent: mockAgent });

      expect(result).toBe('# Test Command\n\nDetailed help for test command.');
    });

    it('should throw error for non-existent command help', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockReturnValue(undefined),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await expect(helpCommand.execute({ remainder: 'nonexistent', agent: mockAgent }))
        .rejects.toThrow('No help available for command /nonexistent');
    });

    it('should handle command help with multiple words', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockImplementation((name: string) => {
          if (name === 'multi word') {
            return {
              name: 'multi word',
              description: 'Multi word command',
              help: '# Multi Word Command\n\nHelp for multi word command.',
              execute: vi.fn(),
            };
          }
          return undefined;
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: 'multi word', agent: mockAgent });

      expect(result).toBe('# Multi Word Command\n\nHelp for multi word command.');
    });
  });

  describe('Help Content Structure', () => {
    it('should include proper markdown formatting', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockReturnValue(new Map([
          ['basic', {
            name: 'basic',
            description: 'Basic command description',
            help: '# Basic Command\n\n## Description\nBasic command help.\n\n## Usage\n/basic\n\n## Examples\n/basic arg1 arg2',
            execute: vi.fn(),
          }],
        ])),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: undefined, agent: mockAgent });

      expect(result).toContain('**Available chat commands:**');
      expect(result).toContain('- Basic command description');
      expect(result).toContain('Use /help <command> to get detailed help for a specific command.');
    });

    it('should handle empty commands list', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockReturnValue(new Map()),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: undefined, agent: mockAgent });

      expect(result).toContain('**Available chat commands:**');
      expect(result).toContain('Use /help <command> to get detailed help for a specific command.');
    });

    it('should handle commands with special characters', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockReturnValue(new Map([
          ['test-command', {
            name: 'test-command',
            description: 'Test command with dash',
            help: '# Test Command\n\nHelp for test command.',
            execute: vi.fn(),
          }],
          ['test_command', {
            name: 'test_command',
            description: 'Test command with underscore',
            help: '# Test Command\n\nHelp for test command.',
            execute: vi.fn(),
          }],
        ])),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: undefined, agent: mockAgent });

      expect(result).toContain('- Test command with dash');
      expect(result).toContain('- Test command with underscore');
    });
  });

  describe('Error Handling', () => {
    it('should handle service resolution errors', async () => {
      mockAgent.requireServiceByType.mockImplementation(() => {
        throw new Error('Service not found');
      });

      await expect(helpCommand.execute({ remainder: undefined, agent: mockAgent })).rejects.toThrow();
    });

    it('should handle command service errors', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockImplementation(() => {
          throw new Error('Failed to get commands');
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await expect(helpCommand.execute({ remainder: undefined, agent: mockAgent })).rejects.toThrow();
    });

    it('should handle get command errors', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockImplementation(() => {
          throw new Error('Failed to get command');
        }),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await expect(helpCommand.execute({ remainder: 'test', agent: mockAgent })).rejects.toThrow();
    });
  });

  describe('Integration with Agent Interface', () => {
    it('should use requireServiceByType correctly', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockReturnValue(new Map([
          ['test', {
            name: 'test',
            description: 'Test command',
            help: 'Test help',
            execute: vi.fn(),
          }],
        ])),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      await helpCommand.execute({ remainder: undefined, agent: mockAgent });

      expect(mockAgent.requireServiceByType).toHaveBeenCalledWith(AgentCommandService);
    });

    it('should handle chat output formatting', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockReturnValue(new Map([
          ['alpha', {
            name: 'alpha',
            description: 'Alpha command',
            help: 'Alpha help',
            execute: vi.fn(),
          }],
          ['beta', {
            name: 'beta',
            description: 'Beta command',
            help: 'Beta help',
            execute: vi.fn(),
          }],
        ])),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: undefined, agent: mockAgent });

      // Commands should be sorted
      expect(result).toContain('- Alpha command');
      expect(result).toContain('- Beta command');
    });
  });

  describe('Help Command Features', () => {
    it('should show comprehensive usage instructions', async () => {
      const mockCommandService = {
        getCommandEntries: vi.fn().mockReturnValue(new Map()),
      };

      mockAgent.requireServiceByType.mockReturnValue(mockCommandService);

      const result = await helpCommand.execute({ remainder: undefined, agent: mockAgent });

      expect(result).toContain('Use /help <command> to get detailed help for a specific command.');
    });

    it('should provide detailed help examples', async () => {
      const mockCommandService = {
        getCommand: vi.fn().mockReturnValue({
          name: 'multi',
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

      const result = await helpCommand.execute({ remainder: 'multi', agent: mockAgent });

      expect(result).toBe(`# Multi Command

## Description
A command with multiple features.

## Usage
/multi option1 value1
/multi option2 value2

## Examples
/multi start process
/multi stop process

## Notes
Additional notes about usage.`);
    });
  });
});
