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

  it("names each agent by its session title: the first prompt, shortened, set once", () => {
    const agent = createTestingAgent(createTestingApp());
    expect(projectAgentList([agent])[0]!.title).toBeUndefined();

    agent.mutateState(AgentEventState, state => state.setTitleOnce(`  fix the\n  login ${"bug ".repeat(40)}`, 1));
    agent.mutateState(AgentEventState, state => state.setTitleOnce("and then this", 2));

    const title = projectAgentList([agent])[0]!.title!;
    expect(title.startsWith("fix the login bug")).toBe(true);
    expect(title.length).toBe(80);
    expect(title.endsWith("…")).toBe(true);
  });

  it("is not titled by commands, which never reach the model", () => {
    const agent = createTestingAgent(createTestingApp());
    agent.mutateState(AgentEventState, state => {
      state.events.push({ type: "input.received", requestId: "r1", timestamp: 1, input: { from: "test", message: "/tools enable x" } });
    });
    expect(projectAgentList([agent])[0]!.title).toBeUndefined();
  });

  it("keeps the title through a checkpoint, and drops it from a branch taken before it was set", () => {
    const agent = createTestingAgent(createTestingApp());
    agent.mutateState(AgentEventState, state => state.setTitleOnce("plan the release", 1_000));
    const state = agent.getState(AgentEventState);
    expect(state.serialize().title).toEqual({ text: "plan the release", at: 1_000 });
    expect(state.serializeAt(999).title).toBeNull();
    expect(state.serializeAt(1_000).title?.text).toBe("plan the release");
  });
});
