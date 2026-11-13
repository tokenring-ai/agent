import { describe, expect, it } from "bun:test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { AgentEventState } from "../../state/agentEventState.ts";
import { projectAgentList } from "../../util/projectAgentList.ts";
import createTestingAgent from "../createTestingAgent.test";

describe("projectAgentList", () => {
  it("counts questions the running input is blocked on, but not follow-up suggestions", () => {
    const agent = createTestingAgent(createTestingApp());
    expect(projectAgentList([agent])[0]!.pendingQuestions).toBe(0);

    agent.mutateState(AgentEventState, state => {
      state.currentlyExecutingInputItem = {
        request: { type: "input.received", requestId: "r", timestamp: 1, input: { from: "test", message: "go" } },
        executionState: {
          status: "running",
          currentActivity: "Asking",
          availableInteractions: [
            { type: "followup", interactionId: "f", timestamp: 1, message: "Try this next" },
            {
              type: "question",
              interactionId: "q",
              timestamp: 1,
              message: "Run the migration?",
              optional: false,
              question: { type: "text", label: "Answer" },
            } as never,
          ],
        },
        interactionCallbacks: new Map(),
        abortController: new AbortController(),
      };
    });

    expect(projectAgentList([agent])[0]!.pendingQuestions).toBe(1);
  });
});
