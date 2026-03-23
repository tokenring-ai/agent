import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import AgentCommandService from '../../services/AgentCommandService.ts';
import type {TokenRingAgentCommand} from '../../types.js';
import createTestingAgent from "../createTestingAgent";
import {CommandFailedError} from "../../AgentError.js";

const mockApp = createTestingApp();
const mockAgent = createTestingAgent(mockApp);

// Mock commands with proper input schema
const mockCommand: TokenRingAgentCommand = {
  name: 'mock',
  description: 'Mock command',
  inputSchema: {
    remainder: {
      name: 'input',
      description: 'Input',
      required: true,
    }
  },
  execute: vi.fn().mockResolvedValue('success'),
  help: 'Mock help text',
};

const mockChatCommand: TokenRingAgentCommand = {
  name: 'chat send',
  description: 'Chat command',
  inputSchema: {
    remainder: {
      name: 'input',
      description: 'Input',
      required: true,
    }
  },
  execute: vi.fn().mockResolvedValue('chat success'),
  help: 'Chat help text',
};

describe('AgentCommandService', () => {
  let service: AgentCommandService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentCommandService(mockApp);

    service.addAgentCommands(mockCommand, mockChatCommand);
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
      const entries = service.getCommandEntries();
      const entriesArray = Array.from(entries);
      expect(entriesArray).toContainEqual(['mock', mockCommand]);
      expect(entriesArray).toContainEqual(['chat send', mockChatCommand]);
    });

    it('should get command names', () => {
      const names = service.getCommandNames();
      expect(names).toContain('mock');
      expect(names).toContain('chat send');
    });

    it('should get command by name', () => {
      const command = service.getCommand('mock');
      expect(command).toBe(mockCommand);
    });

    it('should return undefined for non-existent command', () => {
      const command = service.getCommand('nonexistent');
      expect(command).toBeUndefined();
    });

    it('should get all command entries', () => {
      const entries = service.getCommandEntries();
      const entriesArray = Array.from(entries);
      expect(entriesArray).toHaveLength(2);
      expect(entriesArray).toContainEqual(['mock', mockCommand]);
      expect(entriesArray).toContainEqual(['chat send', mockChatCommand]);
    });
  });

  describe('Command Registration', () => {
    it('should add multiple commands at once', () => {
      const newCommand1: TokenRingAgentCommand = {
        name: 'test1',
        description: 'Test command 1',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn(),
        help: 'Test 1 help',
      };

      const newCommand2: TokenRingAgentCommand = {
        name: 'test2',
        description: 'Test command 2',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn(),
        help: 'Test 2 help',
      };

      service.addAgentCommands(newCommand1, newCommand2);

      const entries = service.getCommandEntries();
      const entriesArray = Array.from(entries);
      expect(entriesArray).toContainEqual(['test1', newCommand1]);
      expect(entriesArray).toContainEqual(['test2', newCommand2]);
    });

    it('should overwrite existing commands', () => {
      const newCommand: TokenRingAgentCommand = {
        name: 'mock',
        description: 'New command',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn(),
        help: 'New help',
      };

      service.addAgentCommands(newCommand);

      const command = service.getCommand('mock');
      expect(command).toBe(newCommand);
    });

    it('should register command aliases', () => {
      const aliasCommand: TokenRingAgentCommand = {
        name: 'alias-test',
        description: 'Command with alias',
        inputSchema: {
          remainder: {
            name: 'input',
            description: 'Input',
            required: true,
          }
        },
        execute: vi.fn(),
        help: 'Alias help',
        aliases: ['alias-test-alt'],
      };

      service.addAgentCommands(aliasCommand);

      // Main command should be registered
      expect(service.getCommand('alias-test')).toBe(aliasCommand);
      // Alias should also work
      expect(service.getCommand('alias-test-alt')).toBe(aliasCommand);
    });
  });
});
