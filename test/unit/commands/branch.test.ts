import { beforeEach, describe, expect, mock, test } from "bun:test";
import type Agent from "../../../Agent.ts";
import branch from "../../../commands/branch.ts";
import AgentManager from "../../../services/AgentManager.ts";

function makeAgent(overrides: { id?: string; checkpoint?: ReturnType<Agent["generateCheckpoint"]>; agentManager?: Partial<AgentManager> } = {}) {
  const id = overrides.id ?? "sunny-river-42";
  const generateCheckpoint = mock(
    () =>
      overrides.checkpoint ?? {
        agentId: id,
        createdAt: Date.now(),
        sessionId: "session-1",
        agentType: "test",
        state: { some: "state" },
      },
  );

  return {
    id,
    generateCheckpoint,
    requireService: mock((_type: unknown) => overrides.agentManager),
  } as unknown as Agent & {
    generateCheckpoint: ReturnType<typeof mock>;
    requireService: ReturnType<typeof mock>;
  };
}

describe("/branch command", () => {
  let spawnAgentFromCheckpoint: ReturnType<typeof mock>;
  let handleInput: ReturnType<typeof mock>;
  let newAgent: { id: string; handleInput: ReturnType<typeof mock> };

  beforeEach(() => {
    handleInput = mock(() => "request-id");
    newAgent = {
      id: "bright-mountain-99",
      handleInput,
    };
    spawnAgentFromCheckpoint = mock(() => newAgent);
  });

  test("checkpoints current agent and spawns a new agent from it", () => {
    const agent = makeAgent({
      agentManager: { spawnAgentFromCheckpoint, branchAgent: AgentManager.prototype.branchAgent } as unknown as AgentManager,
    });

    const result = branch.execute({ agent, remainder: undefined });

    expect(agent.generateCheckpoint).toHaveBeenCalledTimes(1);
    expect(spawnAgentFromCheckpoint).toHaveBeenCalledTimes(1);
    expect(spawnAgentFromCheckpoint).toHaveBeenCalledWith(
      {
        agentId: agent.id,
        createdAt: expect.any(Number),
        sessionId: "session-1",
        agentType: "test",
        state: { some: "state" },
      },
      {
        createMessage: "Branched from agent sunny-ri",
      },
    );
    expect(handleInput).not.toHaveBeenCalled();
    expect(result).toBe("A new agent has been created and can be viewed at: [bright-mountain-99](agent://bright-mountain-99)");
  });

  test("sends optional remainder message to the new agent", () => {
    const agent = makeAgent({
      id: "quiet-lake-7",
      agentManager: { spawnAgentFromCheckpoint, branchAgent: AgentManager.prototype.branchAgent } as unknown as AgentManager,
    });

    const result = branch.execute({ agent, remainder: "continue the auth investigation" });

    expect(spawnAgentFromCheckpoint).toHaveBeenCalledWith(expect.any(Object), {
      createMessage: "Branched from agent quiet-la",
    });
    expect(handleInput).toHaveBeenCalledTimes(1);
    expect(handleInput).toHaveBeenCalledWith({
      from: "Branched from agent quiet-la",
      message: "continue the auth investigation",
    });
    expect(result).toContain("agent://bright-mountain-99");
  });
});
