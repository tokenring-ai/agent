import { afterEach, beforeEach, describe, expect, it, jest, mock, spyOn } from "bun:test";

import { setTimeout as delay } from "node:timers/promises";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import Agent from "../../Agent.ts";
import { AgentConfigSchema } from "../../schema";
import AgentManager from "../../services/AgentManager.ts";
import { AgentEventState } from "../../state/agentEventState.ts";
import { CommandHistoryState } from "../../state/commandHistoryState.ts";
import createTestingAgent from "../createTestingAgent.test";

const app = createTestingApp();

describe("Agent", () => {
  let agent: Agent;

  beforeEach(() => {
    mock.clearAllMocks();
    jest.useRealTimers();
    agent = createTestingAgent(app);
  });

  afterEach(() => {
    jest.useRealTimers();
    const agentManager = app.getService(AgentManager);
    if (agentManager) {
      for (const managed of agentManager.getAgents()) {
        agentManager.deleteAgent(managed.id, "test cleanup");
      }
    }
    mock.clearAllMocks();
  });

  describe("Constructor and Initialization", () => {
    it("should create an agent with correct properties", () => {
      expect(agent.displayName).toBe(agent.config.displayName);
      expect(agent.config.description).toBe(agent.config.description);
      expect(agent.id).toBeDefined();
      // Questions wait for an answer unless whoever started the agent says otherwise.
      expect(agent.getAnswerTimeoutSeconds()).toBeNull();
    });

    it("should initialize state correctly", () => {
      expect(agent.getState(AgentEventState)).toBeDefined();
      expect(agent.getState(CommandHistoryState)).toBeDefined();
    });
  });

  describe("Input Handling", () => {
    it("should handle input correctly", async () => {
      const message = "Test message";
      const requestId = agent.handleInput({ from: "test", message: message });

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe("string");

      await delay(10);
      const eventState = agent.getState(AgentEventState);
      const lastEvent = eventState.events.find(e => e.type === "input.received");
      expect(lastEvent).toBeDefined();
      expect(lastEvent!.type).toBe("input.received");
      expect(lastEvent!.requestId).toBe(requestId);
    });

    it("should not trim input message (trimming happens in command service)", async () => {
      const message = "  Test message with spaces  ";
      agent.handleInput({ from: "test", message: message });

      await delay(10);
      const eventState = agent.getState(AgentEventState);
      // Find the input.received event
      const inputEvent = eventState.events.find(e => e.type === "input.received");
      expect(inputEvent).toBeDefined();
      expect(inputEvent!.input.message).toBe(message);
    });

    it("should add message to command history", () => {
      const message = "Test command";
      agent.handleInput({ from: "test", message: message });

      const historyState = agent.getState(CommandHistoryState);
      expect(historyState.commands).toContain(message);
    });
  });

  describe("Output Methods", () => {
    it("should output chat messages", () => {
      agent.chatOutput("Chat message");

      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: "output.chat",
        message: "Chat message",
      });
    });

    it("should output reasoning messages", () => {
      agent.reasoningOutput("Reasoning message");

      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: "output.reasoning",
        message: "Reasoning message",
      });
    });

    it("should output info messages", () => {
      agent.infoMessage("Info message");

      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: "output.info",
        message: "Info message",
      });
    });

    it("should handle different message levels", () => {
      agent.warningMessage("Warning message");
      agent.errorMessage("Error message");

      const eventState = agent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 2]?.type).toBe("output.warning");
      expect(eventState.events[eventState.events.length - 1]?.type).toBe("output.error");
    });
  });

  describe("Agent Lifecycle", () => {
    it("should calculate idle duration correctly", () => {
      const startTime = Date.now();
      jest.useFakeTimers({ now: startTime });
      try {
        agent.infoMessage("hello world!"); // Sets the last activity time

        // Simulate some time passing
        jest.advanceTimersByTime(1000);

        const idleDuration = agent.getIdleDuration();
        expect(idleDuration).toBeGreaterThanOrEqual(1000);
      } finally {
        jest.useRealTimers();
      }
    });

    it("should calculate run duration correctly", () => {
      const startTime = Date.now();
      jest.useFakeTimers({ now: startTime });
      try {
        // Trigger an event to set the first activity time
        agent.infoMessage("start");

        jest.advanceTimersByTime(2000);

        const runDuration = agent.getRunDuration();
        expect(runDuration).toBeGreaterThanOrEqual(2000);
      } finally {
        jest.useRealTimers();
      }
    });

    it("should abort current operation when there is one", () => {
      // Add an input item to the queue
      agent.mutateState(AgentEventState, state => {
        state.inputQueue.push({
          request: {
            type: "input.received",
            requestId: "test-request",
            timestamp: Date.now(),
            input: { from: "test", message: "test" },
          },
          executionState: {
            status: "queued",
            currentActivity: "test",
            availableInteractions: [],
          },
          interactionCallbacks: new Map(),
          abortController: new AbortController(),
        });
        state.currentlyExecutingInputItem = state.inputQueue[0] ?? null;
      });

      const reason = "Test abort reason";
      const result = agent.abortCurrentOperation(reason);

      expect(result).toBe(true);
      const eventState = agent.getState(AgentEventState);
      expect(eventState.currentlyExecutingInputItem?.abortController.signal.aborted).toBe(true);
    });

    it("should return false when aborting with no current operation", () => {
      const reason = "Test abort reason";
      const result = agent.abortCurrentOperation(reason);

      expect(result).toBe(false);
    });
  });

  describe("Human Interface", () => {
    it("refuses an approval at once, without posting it, when nobody can answer (deadline 0)", async () => {
      agent.answerTimeoutSeconds = 0;
      await expect(agent.askForApproval({ message: "foo", defaultValue: true })).resolves.toBe(false);
    });

    it("should handle busyWithActivity correctly", async () => {
      // Setup: need an input item to be executing
      const abortController = new AbortController();
      agent.mutateState(AgentEventState, state => {
        state.currentlyExecutingInputItem = {
          request: {
            type: "input.received",
            requestId: "test-request",
            timestamp: Date.now(),
            input: { from: "test", message: "test" },
          },
          executionState: {
            status: "running",
            currentActivity: "initial",
            availableInteractions: [],
          },
          interactionCallbacks: new Map(),
          abortController,
        };
      });

      const promise = Promise.resolve("result");
      const result = await agent.busyWithActivity("Loading...", promise);

      expect(result).toBe("result");

      // After completion, the activity should be restored
      const eventState = agent.getState(AgentEventState);
      expect(eventState.currentlyExecutingInputItem?.executionState.currentActivity).toBe("initial");
    });

    it("should set current activity", () => {
      const abortController = new AbortController();
      agent.mutateState(AgentEventState, state => {
        state.currentlyExecutingInputItem = {
          request: {
            type: "input.received",
            requestId: "test-request",
            timestamp: Date.now(),
            input: { from: "test", message: "test" },
          },
          executionState: {
            status: "running",
            currentActivity: "initial",
            availableInteractions: [],
          },
          interactionCallbacks: new Map(),
          abortController,
        };
      });

      agent.setCurrentActivity("New activity");

      const eventState = agent.getState(AgentEventState);
      expect(eventState.currentlyExecutingInputItem?.executionState.currentActivity).toBe("New activity");
    });
  });

  describe("Configuration", () => {
    it("should get config slice with valid schema", () => {
      const displayName = agent.getAgentConfigSlice("displayName", AgentConfigSchema.shape.displayName);
      expect(displayName).toEqual(agent.config.displayName);
    });

    it("should throw error for invalid config slice", () => {
      expect(() => {
        agent.getAgentConfigSlice("nonexistent", AgentConfigSchema.shape.displayName);
      }).toThrow();
    });
  });

  describe("Checkpointing", () => {
    it("should generate checkpoint data", () => {
      const checkpoint = agent.generateCheckpoint();

      expect(checkpoint).toMatchObject({
        agentId: agent.id,
        createdAt: expect.any(Number),
        sessionId: agent.app.sessionId,
        agentType: agent.config.agentType,
        state: expect.any(Object),
      });

      // Checkpoint does NOT include config
      expect((checkpoint as any).config).toBeUndefined();
    });

    it("should restore state from checkpoint", async () => {
      // Add some state
      agent.handleInput({ from: "test", message: "test" });
      await delay(10);

      const checkpoint = agent.generateCheckpoint();

      // Create new agent and restore
      const newAgent = createTestingAgent(app);
      newAgent.restoreState(checkpoint.state);

      const eventState = newAgent.getState(AgentEventState);
      // Events should be restored (with cleanup during restore)
      expect(eventState.events.length).toBeGreaterThan(0);
    });
  });

  describe("Debug Mode", () => {
    it("should handle debug messages when enabled", () => {
      const debugConfig = AgentConfigSchema.parse({
        agentType: "test",
        displayName: "Test",
        description: "Test",
        category: "test",
        debug: true,
        createMessage: "Test",
      });

      const debugAgent = new Agent(app, {}, debugConfig, new AbortController().signal);

      debugAgent.debugMessage("Debug message");

      const eventState = debugAgent.getState(AgentEventState);
      expect(eventState.events[eventState.events.length - 1]).toMatchObject({
        type: "output.info",
        message: "Debug message",
      });
    });

    it("should not output debug messages when disabled", () => {
      const initialEventCount = agent.getState(AgentEventState).events.length;

      agent.debugMessage("Debug message");

      const eventState = agent.getState(AgentEventState);
      // No new events should be added
      expect(eventState.events.length).toBe(initialEventCount);
    });
  });

  describe("Background Task", () => {
    it("should run background task", async () => {
      const taskCalled = mock();
      const task = mock().mockImplementation((_signal: AbortSignal) => {
        taskCalled();
        // Task completes synchronously
      });

      agent.runBackgroundTask(task as any);

      await delay(100);

      expect(task).toHaveBeenCalled();
      expect(taskCalled).toHaveBeenCalled();
    });

    it("should handle background task errors", async () => {
      const errorMessageSpy = spyOn(agent, "errorMessage").mockImplementation(() => {});

      const task = mock().mockImplementation((_signal: AbortSignal) => {
        throw new Error("Background task failed");
      });

      agent.runBackgroundTask(task as any);

      await delay(100);

      expect(errorMessageSpy).toHaveBeenCalled();
    });
  });

  describe("Send Interaction Response", () => {
    it("should send interaction response", () => {
      // Setup: need an input item in the queue with a callback
      const resolveCallback = mock();
      agent.mutateState(AgentEventState, state => {
        state.inputQueue.push({
          request: {
            type: "input.received",
            requestId: "test-request",
            timestamp: Date.now(),
            input: { from: "test", message: "test" },
          },
          executionState: {
            status: "running",
            currentActivity: "test",
            availableInteractions: [],
          },
          interactionCallbacks: new Map([["test-interaction", resolveCallback]]),
          abortController: new AbortController(),
        });
        state.currentlyExecutingInputItem = state.inputQueue[0] ?? null;
      });

      agent.sendInteractionResponse({
        requestId: "test-request",
        interactionId: "test-interaction",
        result: "test-result",
      });

      const eventState = agent.getState(AgentEventState);
      const lastEvent = eventState.events.find(e => e.type === "input.interaction");
      expect(lastEvent).toBeDefined();
      expect(lastEvent!.type).toBe("input.interaction");
      expect(lastEvent!.requestId).toBe("test-request");
      expect(resolveCallback).toHaveBeenCalledWith("test-result");
    });

    it("answers a masked question with the real value but keeps only a placeholder in the history", () => {
      const resolveCallback = mock();
      const question = {
        type: "question" as const,
        interactionId: "key-question",
        timestamp: Date.now(),
        message: "Paste your API key",
        question: { type: "text" as const, label: "API key", masked: true, required: false, defaultValue: "", expectedLines: 1 },
        optional: false,
      };
      agent.mutateState(AgentEventState, state => {
        state.inputQueue.push({
          request: { type: "input.received", requestId: "masked-request", timestamp: Date.now(), input: { from: "test", message: "/connect openai" } },
          executionState: { status: "running", currentActivity: "test", availableInteractions: [question] },
          interactionCallbacks: new Map([["key-question", resolveCallback]]),
          abortController: new AbortController(),
        });
        state.currentlyExecutingInputItem = state.inputQueue.at(-1) ?? null;
      });

      agent.sendInteractionResponse({ requestId: "masked-request", interactionId: "key-question", result: "sk-secret-123" });

      expect(resolveCallback).toHaveBeenCalledWith("sk-secret-123");
      const recorded = agent.getState(AgentEventState).events.find(e => e.type === "input.interaction" && e.interactionId === "key-question");
      expect(recorded).toMatchObject({ result: "••••••••" });
      expect(JSON.stringify(agent.getState(AgentEventState).serialize())).not.toContain("sk-secret-123");
    });

    it("redacts masked answers in histories saved before redaction existed", () => {
      const question = {
        type: "question" as const,
        interactionId: "old-key",
        timestamp: 1,
        message: "Paste your API key",
        question: { type: "text" as const, label: "API key", masked: true, required: false, defaultValue: "", expectedLines: 1 },
        optional: false,
      };
      const state = new AgentEventState();
      state.deserialize({
        events: [
          { type: "input.received", requestId: "r", timestamp: 1, input: { from: "test", message: "/connect slack" } },
          { type: "input.execution", requestId: "r", timestamp: 2, status: "running", currentActivity: "", availableInteractions: [question] },
          { type: "input.interaction", requestId: "r", interactionId: "old-key", result: "xoxb-raw-token", timestamp: 3 },
          { type: "agent.response", requestId: "r", timestamp: 4, status: "success", message: "done" },
        ],
      } as never);
      expect(JSON.stringify(state.events)).not.toContain("xoxb-raw-token");
      expect(state.events.find(e => e.type === "input.interaction")).toMatchObject({ result: "••••••••" });
    });

    it("rejects at once when the request was already aborted, instead of waiting forever", async () => {
      const abortController = new AbortController();
      abortController.abort("User cancelled");
      agent.mutateState(AgentEventState, state => {
        state.inputQueue.push({
          request: { type: "input.received", requestId: "aborted-request", timestamp: Date.now(), input: { from: "test", message: "test" } },
          executionState: { status: "running", currentActivity: "test", availableInteractions: [] },
          interactionCallbacks: new Map(),
          abortController,
        });
        state.currentlyExecutingInputItem = state.inputQueue.at(-1) ?? null;
      });

      const pending = agent.waitForInteraction({ type: "question", message: "Allow it?", question: { type: "text", label: "Answer" } } as Parameters<
        typeof agent.waitForInteraction
      >[0]);
      const outcome = await Promise.race([
        pending.then(
          () => "resolved",
          (reason: unknown) => (reason as Error).message,
        ),
        new Promise(resolve => setTimeout(() => resolve("hung"), 200)),
      ]);
      expect(outcome).toBe("User cancelled");
      expect(agent.getState(AgentEventState).currentlyExecutingInputItem?.executionState.availableInteractions).toEqual([]);
    });
  });
});
