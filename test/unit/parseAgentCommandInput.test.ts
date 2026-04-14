import {describe, expect, it} from "vitest";
import {CommandFailedError} from "../../AgentError.ts";
import type {AgentCommandInputSchema, TokenRingAgentCommand} from "../../types.ts";
import {parseAgentCommandInput} from "../../util/parseAgentCommandInput.ts";

describe("parseAgentCommandInput", () => {
  it("accepts apostrophes inside a remainder", () => {
    const inputSchema = {
      remainder: {name: "message", description: "Message", required: true},
    } as const satisfies AgentCommandInputSchema;

    const command = {
      name: "chat send",
      description: "Send a chat message",
      help: "help",
      inputSchema,
      execute: () => "",
    } satisfies TokenRingAgentCommand<typeof inputSchema>;

    const parsed = parseAgentCommandInput(command, "hey they're", [], {} as any);

    expect(parsed.remainder).toBe("hey they're");
  });

  it("supports quoted remainders", () => {
    const inputSchema = {
      remainder: {name: "message", description: "Message", required: true},
    } as const satisfies AgentCommandInputSchema;

    const command = {
      name: "chat send",
      description: "Send a chat message",
      help: "help",
      inputSchema,
      execute: () => "",
    } satisfies TokenRingAgentCommand<typeof inputSchema>;

    const parsed = parseAgentCommandInput(command, '"hello world"', [], {} as any);

    expect(parsed.remainder).toBe("hello world");
  });

  it("supports quoted argument values after equals", () => {
    const inputSchema = {
      args: {
        message: {type: "string", description: "Message", required: true},
      },
    } as const satisfies AgentCommandInputSchema;

    const command = {
      name: "mock",
      description: "Mock command",
      help: "help",
      inputSchema,
      execute: () => "",
    } satisfies TokenRingAgentCommand<typeof inputSchema>;

    const parsed = parseAgentCommandInput(command, 'message="hello world"', [], {} as any);

    expect(parsed.args?.message).toBe("hello world");
  });

  it("handles escaped characters", () => {
    const inputSchema = {
      remainder: {name: "message", description: "Message", required: true},
    } as const satisfies AgentCommandInputSchema;

    const command = {
      name: "chat send",
      description: "Send a chat message",
      help: "help",
      inputSchema,
      execute: () => "",
    } satisfies TokenRingAgentCommand<typeof inputSchema>;

    const parsed = parseAgentCommandInput(command, 'hello\\ world', [], {} as any);

    expect(parsed.remainder).toBe("hello world");
  });

  it("throws error for unterminated quotes", () => {
    const inputSchema = {
      remainder: {name: "message", description: "Message", required: true},
    } as const satisfies AgentCommandInputSchema;

    const command = {
      name: "chat send",
      description: "Send a chat message",
      help: "help",
      inputSchema,
      execute: () => "",
    } satisfies TokenRingAgentCommand<typeof inputSchema>;

    expect(() => parseAgentCommandInput(command, '"unterminated', [], {} as any))
      .toThrow("Unterminated quote");
  });

  describe("Number Arguments", () => {
    it("parses number arguments", () => {
      const inputSchema = {
        args: {
          count: {type: "number", description: "Count", required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const parsed = parseAgentCommandInput(command, 'count=42', [], {} as any);

      expect(parsed.args?.count).toBe(42);
    });

    it("throws error for non-numeric values", () => {
      const inputSchema = {
        args: {
          count: {type: "number", description: "Count", required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, 'count=invalid', [], {} as any))
        .toThrow("must be a valid number");
    });

    it("validates number minimum", () => {
      const inputSchema = {
        args: {
          count: {type: "number", description: "Count", minimum: 1, required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, 'count=0', [], {} as any))
        .toThrow("must be at least 1");
    });

    it("validates number maximum", () => {
      const inputSchema = {
        args: {
          count: {type: "number", description: "Count", maximum: 100, required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, 'count=101', [], {} as any))
        .toThrow("must be at most 100");
    });
  });

  describe("String Arguments", () => {
    it("parses string arguments", () => {
      const inputSchema = {
        args: {
          name: {type: "string", description: "Name", required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const parsed = parseAgentCommandInput(command, 'name=John', [], {} as any);

      expect(parsed.args?.name).toBe("John");
    });

    it("validates string minimum length", () => {
      const inputSchema = {
        args: {
          name: {type: "string", description: "Name", minimum: 3, required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, 'name=Jo', [], {} as any))
        .toThrow("must be at least 3 characters");
    });

    it("validates string maximum length", () => {
      const inputSchema = {
        args: {
          name: {type: "string", description: "Name", maximum: 5, required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, 'name=JohnDoe', [], {} as any))
        .toThrow("must be at most 5 characters");
    });
  });

  describe("Positional Arguments", () => {
    it("parses positional arguments", () => {
      const inputSchema = {
        positionals: [
          {name: "first", description: "First", required: true},
          {name: "second", description: "Second", required: true},
        ],
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const parsed = parseAgentCommandInput(command, 'first second', [], {} as any);

      expect(parsed.positionals?.first).toBe("first");
      expect(parsed.positionals?.second).toBe("second");
    });

    it("throws error for missing required positional", () => {
      const inputSchema = {
        positionals: [
          {name: "first", description: "First", required: true},
        ],
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, '', [], {} as any))
        .toThrow("Missing required positional first");
    });

    it("uses default value for optional positional", () => {
      const inputSchema = {
        positionals: [
          {name: "first", description: "First", defaultValue: "default"},
        ],
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const parsed = parseAgentCommandInput(command, '', [], {} as any);

      expect(parsed.positionals?.first).toBe("default");
    });

    it("throws error for too many positional arguments", () => {
      const inputSchema = {
        positionals: [
          {name: "first", description: "First", required: true},
        ],
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, 'first second', [], {} as any))
        .toThrow("Too many positional arguments");
    });
  });

  describe("Remainder Arguments", () => {
    it("captures remaining tokens as remainder", () => {
      const inputSchema = {
        remainder: {name: "message", description: "Message", required: true},
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const parsed = parseAgentCommandInput(command, 'hello world test', [], {} as any);

      expect(parsed.remainder).toBe("hello world test");
    });

    it("uses default value for optional remainder", () => {
      const inputSchema = {
        remainder: {name: "message", description: "Message", defaultValue: "default message"},
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const parsed = parseAgentCommandInput(command, '', [], {} as any);

      expect(parsed.remainder).toBe("default message");
    });

    it("throws error for missing required remainder", () => {
      const inputSchema = {
        remainder: {name: "message", description: "Message", required: true},
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, '', [], {} as any))
        .toThrow("Missing required remainder message");
    });
  });

  describe("Attachments", () => {
    it("includes attachments when allowed", () => {
      const inputSchema = {
        allowAttachments: true,
        remainder: {name: "message", description: "Message", required: true},
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const attachments = [{name: "file.txt", content: "test content"}];
      const parsed = parseAgentCommandInput(command, 'hello', attachments, {} as any);

      expect(parsed.attachments).toEqual(attachments);
    });

    it("throws error when attachments not allowed", () => {
      const inputSchema = {
        allowAttachments: false,
        remainder: {name: "message", description: "Message", required: true},
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      const attachments = [{name: "file.txt", content: "test content"}];

      expect(() => parseAgentCommandInput(command, 'hello', attachments, {} as any))
        .toThrow("Attachments are not allowed");
    });
  });

  describe("Error Handling", () => {
    it("throws error for unknown arguments", () => {
      const inputSchema = {
        args: {
          known: {type: "string", description: "Known", required: true},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      // When args schema is defined, unknown arguments should throw
      expect(() => parseAgentCommandInput(command, 'known=value unknown=foo', [], {} as any))
        .toThrow(/Unknown argument|does not take positional/);
    });

    it("throws error for duplicate arguments", () => {
      const inputSchema = {
        args: {
          count: {type: "number", description: "Count"},
        },
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "help",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      expect(() => parseAgentCommandInput(command, 'count=1 count=2', [], {} as any))
        .toThrow("was provided more than once");
    });

    it("formats error messages with command usage", () => {
      const inputSchema = {
        remainder: {name: "message", description: "Message", required: true},
      } as const satisfies AgentCommandInputSchema;

      const command = {
        name: "test",
        description: "Test command",
        help: "## Usage\n/test <message>",
        inputSchema,
        execute: () => "",
      } satisfies TokenRingAgentCommand<typeof inputSchema>;

      try {
        parseAgentCommandInput(command, '', [], {} as any);
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(CommandFailedError);
        const cmdError = error as CommandFailedError;
        expect(cmdError.message).toContain("/test");
      }
    });
  });
});
