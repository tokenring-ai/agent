import {z} from "zod";
import {AgentEventEnvelope, AgentEventEnvelopeSchema, AgentExecutionStateSchema} from "../AgentEvents.js";
import {AgentStateSlice} from "../types.ts";

const serializationSchema = z.object({
  events: z.array(AgentEventEnvelopeSchema).default([])
}).prefault({});

export type AgentEventCursor = {
  position: number,
}

export class AgentEventState extends AgentStateSlice<typeof serializationSchema> {
  latestExecutionState: z.output<typeof AgentExecutionStateSchema> = {
    type: 'agent.execution',
    timestamp: Date.now(),
    running: false,
    paused: false,
    busyWith: null,
    waitingOn: [],
    inputQueue: [],
    currentlyExecuting: null
  };

  resume: (() => void) | null = null;

  currentExecutionAbortController: AbortController | null = null;

  get idle(): boolean {
    return this.latestExecutionState.running && this.latestExecutionState.inputQueue.length === 0;
  }

  events: AgentEventEnvelope[] = [this.latestExecutionState];

  constructor({}: {}) {
    super("AgentEventState",serializationSchema);
  }

  updateExecutionState(state: Partial<z.output<typeof AgentExecutionStateSchema>>) {
    this.emit({
      ...this.latestExecutionState,
      ...state,
      timestamp: Date.now()
    });
  }

  emit(event: AgentEventEnvelope): void {
    this.events.push(event);
    if (event.type === "agent.execution") {
      this.latestExecutionState = event;
    } else if (event.type === "input.received") {
      this.updateExecutionState({
        inputQueue: [...this.latestExecutionState.inputQueue, event],
      });
    } else if (event.type === "abort") {
      const requestId = this.latestExecutionState.currentlyExecuting

      for (const item of this.latestExecutionState.inputQueue) {
        if (item.requestId === requestId) continue;
        this.emit({
          type: "input.handled",
          requestId: item.requestId,
          status: "cancelled",
          message: "Aborted",
          timestamp: Date.now(),
        });
      }

      this.updateExecutionState({
        inputQueue: this.latestExecutionState.inputQueue.filter(i => i.requestId !== requestId)
      });

      if (this.currentExecutionAbortController) {
        this.currentExecutionAbortController.abort(event.message);
      }
    } else if (event.type === "pause") {
      this.updateExecutionState({
        paused: true,
      });
    } else if (event.type === "resume") {
      this.updateExecutionState({
        paused: false,
      });
      this.resume?.();
      this.resume = null;
    } else if (event.type === 'question.request' ) {
      this.updateExecutionState({
        waitingOn: [...this.latestExecutionState.waitingOn, event],
      });
    } else if (event.type === "question.response") {
      this.updateExecutionState({
        waitingOn: this.latestExecutionState.waitingOn.filter(item => item.requestId !== event.requestId),
      });
    }
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      events: this.events
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
     // When restoring the event state, we need to clean up the events to put the agent back into a usable state
    const events: AgentEventEnvelope[] = data.events || [];
    const receivedEvents = new Set<string>();
    for (const event of events) {
      if (event.type === "input.received") receivedEvents.add(event.requestId);
    }

    for (const event of events) {
      switch (event.type) {
        case "agent.execution":
        case "agent.created":
        case "agent.stopped":
        case "pause":
        case "resume":
        case "abort":
          break
        case "input.handled":
          receivedEvents.delete(event.requestId);
          this.events.push({...event, timestamp: Date.now()})
          break;
        case "input.received":
          receivedEvents.add(event.requestId);
          this.events.push({...event, timestamp: Date.now()})
          break;
        case "status":
        case "output.info":
        case "output.warning":
        case "output.error":
        case "output.chat":
        case "output.reasoning":
        case "output.artifact":
        case "question.request":
        case "question.response":
          this.events.push({...event, timestamp: Date.now()})
          break;
        default:
          // noinspection JSUnusedLocalSymbols
          const foo: never = event;
          break;
      }
    }

    for (const requestId of receivedEvents.values()) {
      this.emit({
        type: "input.handled",
        requestId: requestId,
        status: "cancelled",
        message: "Command was in a mid-execution state during checkpoint restore.",
        timestamp: Date.now(),
      });
    }
  }

  show(): string[] {
    return [
      `Events: ${this.events.length}`,
    ];
  }

  getEventCursorFromCurrentPosition() : AgentEventCursor {
    return {
      position: this.events.length
    }
  }

  * yieldEventsByCursor(cursor: AgentEventCursor) : Generator<AgentEventEnvelope> {
    for (; cursor.position < this.events.length; cursor.position++) {
      yield this.events[cursor.position];
    }
  }
}
