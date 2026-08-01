import { spyOn } from "bun:test";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type Agent from "../../Agent.ts";
import type { ParsedAgentCommandConfig } from "../../schema.ts";
import { createAgentCommand } from "../../util/createAgentCommand.ts";
import { runSubAgent } from "../../util/runSubAgent.ts";

function makeCommandConfig(overrides: Partial<ParsedAgentCommandConfig> = {}): ParsedAgentCommandConfig {
  return {
    agentType: "research",
    description: "Deep research",
    commandSchema: {
      remainder: {
        name: "prompt",
        description: "Prompt to send to the agent",
        required: true,
      },
    },
    background: false,
    requireNewAgent: false,
    steps: ["Research this: {{ prompt }}"],
    subAgent: {
      forwardChatOutput: false,
      forwardStatusMessages: true,
      forwardSystemOutput: false,
      forwardHumanRequests: true,
      forwardReasoning: false,
      forwardInputCommands: true,
      timeout: 0,
      maxResponseLength: 10000,
      minContextLength: 1000,
    },
    ...overrides,
  };
}

function makeAgent(agentType: string, services: Record<string, unknown>) {
  return {
    config: { agentType, headless: false },
    headless: false,
    requireService: (type: new (...args: any[]) => unknown) => {
      const name = type.name;
      const service = services[name];
      if (!service) throw new Error(`Missing service ${name}`);
      return service;
    },
    getService: () => undefined,
  } as unknown as Agent;
}

describe("createAgentCommand requireNewAgent", () => {
  let executeAgentCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    executeAgentCommand = mock(async () => ({ message: "chat done" }));
    spyOn(runSubAgent).mockImplementation(async () => ({
      status: "success" as const,
      response: "subagent done",
    }));
  });

  test("runs steps in place via /chat send when same type and requireNewAgent is false", async () => {
    const command = createAgentCommand("deep research", makeCommandConfig({ requireNewAgent: false }));
    const agent = makeAgent("research", {
      AgentCommandService: { executeAgentCommand },
    });

    const result = await command.execute({
      remainder: "solid state batteries",
      args: {},
      attachments: [],
      agent,
    });

    expect(result).toBe("chat done");
    expect(executeAgentCommand).toHaveBeenCalledTimes(1);
    expect(executeAgentCommand.mock.calls[0]![1]).toContain("/chat send");
    expect(executeAgentCommand.mock.calls[0]![1]).toContain("solid state batteries");
    expect(runSubAgent).not.toHaveBeenCalled();
  });

  test("spawns background subagent when agent types differ", async () => {
    const command = createAgentCommand("deep research", makeCommandConfig({ requireNewAgent: false }));
    const agent = makeAgent("code", {
      AgentCommandService: { executeAgentCommand }
    });

    const result = await command.execute({
      remainder: "solid state batteries",
      args: {},
      attachments: [],
      agent,
    });

    expect(result).toBe("Agent research started in background.");
    expect(runSubAgent).toHaveBeenCalledTimes(1);
    expect(runSubAgent.mock.calls[0]![0].background).toBe(true);
    expect(runSubAgent.mock.calls[0]![0].agentType).toBe("research");
    expect(executeAgentCommand).not.toHaveBeenCalled();
  });

  test("always spawns subagent when requireNewAgent is true even if types match", async () => {
    const command = createAgentCommand("deep research", makeCommandConfig({ requireNewAgent: true, background: false }));
    const agent = makeAgent("research", {
      AgentCommandService: { executeAgentCommand }
    });

    const result = await command.execute({
      remainder: "topic",
      args: {},
      attachments: [],
      agent,
    });

    expect(result).toBe("subagent done");
    expect(runSubAgent).toHaveBeenCalledTimes(1);
    expect(runSubAgent.mock.calls[0]![0].background).toBe(false);
    expect(executeAgentCommand).not.toHaveBeenCalled();
  });
});
