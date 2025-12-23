import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AgentCommandService from '../../services/AgentCommandService.ts';
import type { TokenRingAgentCommand } from '../../types.js';
import createTestingAgent from "../createTestingAgent";

const mockApp = createTestingApp();
const mockAgent = createTestingAgent(mockApp)
// Mock commands
const mockCommand: TokenRingAgentCommand = {
  description: 'Mock command',
  execute: vi.fn().mockResolvedValue('success'),
  help: 'Mock help text',
};

const mockChatCommand: TokenRingAgentCommand = {
  description: 'Chat command',
  execute: vi.fn().mockResolvedValue('chat success'),
  help: 'Chat help text',
};

describe('AgentCommandService', () => {
  let service: AgentCommandService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentCommandService();

    service.addAgentCommands({
      'mock': mockCommand,
      'chat': mockChatCommand,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Properties', () => {
    it('should have correct name and description', () => {
      expect(service.name).toBe('AgentCommandService');
      expect(service.description).toBe('A service which registers and dispatches agent commands.');
    });

    it('should register commands correctly', () => {
      const commands = service.getCommands();
      expect(commands).toHaveProperty('mock');
      expect(commands).toHaveProperty('chat');
    });

    it('should get command names', () => {
      const names = service.getCommandNames();
      expect(names).toContain('mock');
      expect(names).toContain('chat');
    });

    it('should get command by name', () => {
      const command = service.getCommand('mock');
      expect(command).toBe(mockCommand);
    });

    it('should throw error for non-existent command', () => {
      expect(() => service.getCommand('nonexistent')).toThrow();
    });

    it('should get all command items', () => {
      const commands = service.getCommands();
      expect(Object.keys(commands)).toHaveLength(2);
      expect(commands.mock).toBe(mockCommand);
      expect(commands.chat).toBe(mockChatCommand);
    });
  });

  describe('Command Execution', () => {
    it('should execute chat command', async () => {
      await service.executeAgentCommand(mockAgent, '/chat test message');
      
      expect(mockChatCommand.execute).toHaveBeenCalledWith('test message', mockAgent);
    });

    it('should execute regular command', async () => {
      await service.executeAgentCommand(mockAgent, '/mock test');
      
      expect(mockCommand.execute).toHaveBeenCalledWith('test', mockAgent);
    });

    it('should handle commands with spaces', async () => {
      await service.executeAgentCommand(mockAgent, '/mock  test with spaces  ');
      
      expect(mockCommand.execute).toHaveBeenCalledWith('test with spaces', mockAgent);
    });

    it('should handle plural command names', async () => {
      await service.executeAgentCommand(mockAgent, '/mocks test');
      
      expect(mockCommand.execute).toHaveBeenCalledWith('test', mockAgent);
    });

    it('should handle unknown commands', async () => {
      vi.spyOn(mockAgent, 'errorLine');
      await service.executeAgentCommand(mockAgent, '/unknown command');
      
      expect(mockAgent.errorLine).toHaveBeenCalledWith(
        'Unknown command: /unknown. Type /help for a list of commands.'
      );
      expect(mockCommand.execute).not.toHaveBeenCalled();
    });

    it('should handle non-command messages', async () => {
      await service.executeAgentCommand(mockAgent, 'regular message');
      
      expect(mockChatCommand.execute).toHaveBeenCalledWith('send regular message', mockAgent);
    });

    it('should trim input messages', async () => {
      await service.executeAgentCommand(mockAgent, '  spaced message  ');
      
      expect(mockChatCommand.execute).toHaveBeenCalledWith('send spaced message', mockAgent);
    });
  });

  describe('Command Registration', () => {
    it('should add multiple commands', () => {
      service.addAgentCommands({
        'test1': {
          description: 'Test command 1',
          execute: vi.fn(),
          help: 'Test 1 help',
        },
        'test2': {
          description: 'Test command 2',
          execute: vi.fn(),
          help: 'Test 2 help',
        },
      });

      const commands = service.getCommands();
      expect(commands).toHaveProperty('test1');
      expect(commands).toHaveProperty('test2');
    });

    it('should overwrite existing commands', () => {
      const newCommand = {
        description: 'New command',
        execute: vi.fn(),
        help: 'New help',
      };

      service.addAgentCommands({
        'mock': newCommand,
      });

      const command = service.getCommand('mock');
      expect(command).toBe(newCommand);
    });
  });

  describe('Error Handling', () => {
    it('should handle command execution errors', async () => {
      const errorCommand: TokenRingAgentCommand = {
        description: 'Error command',
        execute: vi.fn().mockRejectedValue(new Error('Command failed')),
        help: 'Error help',
      };

      service.addAgentCommands({
        'error': errorCommand,
      });

      try {
        await service.executeAgentCommand(mockAgent, '/error test');
      } catch (e) {
        expect(e.message).toBe('Command failed');
      }

      expect(errorCommand.execute).toHaveBeenCalledWith('test', mockAgent);
    });

    it('should handle empty messages', async () => {
      await service.executeAgentCommand(mockAgent, '');
      
      expect(mockChatCommand.execute).not.toHaveBeenCalled()
    });

    it('should handle messages with only spaces', async () => {
      await service.executeAgentCommand(mockAgent, '   ');
      
      expect(mockChatCommand.execute).not.toHaveBeenCalled()
    });
  });

  describe('Default Command Behavior', () => {
    it('should use default chat command for non-command messages', async () => {
      await service.executeAgentCommand(mockAgent, 'hello world');

      expect(mockChatCommand.execute).toHaveBeenCalledWith('send hello world', mockAgent);
    });

    it('should handle commands without leading slash', async () => {
      await service.executeAgentCommand(mockAgent, 'mock test');

      expect(mockChatCommand.execute).toHaveBeenCalledWith('send mock test', mockAgent);
    });
  });

  describe('Command Parsing', () => {
    it('should parse command names correctly', async () => {
      await service.executeAgentCommand(mockAgent, '/test-command');
      
      const commands = service.getCommands();
      const commandNames = Object.keys(commands);
      
      // Should try to find command without special characters
      expect(commandNames).toContain('mock');
      expect(commandNames).toContain('chat');
    });

    it('should handle complex command patterns', async () => {
      await service.executeAgentCommand(mockAgent, '/command-name with args');
      
      expect(mockChatCommand.execute).not.toBeCalled();
    });
  });
});