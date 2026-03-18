import {describe, expect, it} from "vitest";
import {parseAgentCommandInput} from "../../util/parseAgentCommandInput.ts";
import type {AgentCommandInputSchema, TokenRingAgentCommand} from "../../types.ts";

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

    const parsed = parseAgentCommandInput(command, "\"hello world\"", [], {} as any);

    expect(parsed.remainder).toBe("hello world");
  });

  it("supports quoted argument values after equals", () => {
    const inputSchema = {
      args: {
        "--message": {type: "string", description: "Message", required: true},
      },
    } as const satisfies AgentCommandInputSchema;

    const command = {
      name: "mock",
      description: "Mock command",
      help: "help",
      inputSchema,
      execute: () => "",
    } satisfies TokenRingAgentCommand<typeof inputSchema>;

    const parsed = parseAgentCommandInput(command, "--message=\"hello world\"", [], {} as any);

    expect(parsed.args["--message"]).toBe("hello world");
  });
});
