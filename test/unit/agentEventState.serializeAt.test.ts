import { describe, expect, it } from "bun:test";
import { AgentEventState } from "../../state/agentEventState.ts";

describe("AgentEventState.serializeAt", () => {
  it("keeps the events up to the branch point, with streamed chunks joined", () => {
    const state = new AgentEventState();
    state.events = [
      { type: "output.chat", message: "Hel", timestamp: 100 },
      { type: "output.chat", message: "lo", timestamp: 110 },
      { type: "output.info", message: "later", timestamp: 300 },
    ];

    expect(state.serializeAt(200).events).toEqual([{ type: "output.chat", message: "Hello", timestamp: 100 }]);
    // Serializing never edits the live log.
    expect(state.events).toHaveLength(3);
    expect(state.serialize().events).toHaveLength(2);
  });
});
