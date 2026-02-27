import {AgentEventEnvelope, AgentEventEnvelopeSchema, AgentExecutionStateSchema} from "../AgentEvents.js";
import {getDefaultQuestionValue} from "../question.ts";
import {AgentStateSlice} from "../types.ts";
import {z} from "zod";

const serializationSchema = z.object({
  events: z.array(AgentEventEnvelopeSchema).default([])
}).prefault({});

export type AgentEventCursor = {
  position: number,
}

export class AgentEventState implements AgentStateSlice<typeof serializationSchema> {
  readonly name = "AgentEventState";
  serializationSchema = serializationSchema;
  latestExecutionState: z.output<typeof AgentExecutionStateSchema> = {
    type: 'agent.execution',
    timestamp: Date.now(),
    running: false,
    busyWith: null,
    waitingOn: [],
    inputQueue: [],
    currentlyExecuting: null,
    statusLine: null
  };

  currentExecutionAbortController: AbortController | null = null;

  get idle(): boolean {
    return this.latestExecutionState.running && this.latestExecutionState.inputQueue.length === 0;
  }

  events: AgentEventEnvelope[] = [this.latestExecutionState]

  constructor({}: {}) {}

  updateExecutionState(state: Partial<z.output<typeof AgentExecutionStateSchema>>) {
    this.latestExecutionState = {
      ...this.latestExecutionState,
      ...state,
      timestamp: Date.now()
    };
    this.emit(this.latestExecutionState);
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
      const requestId = this.latestExecutionState!.currentlyExecuting

      for (const item of this.latestExecutionState!.inputQueue) {
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
        inputQueue: this.latestExecutionState!.inputQueue.filter(i => i.requestId !== requestId)
      });

      if (this.currentExecutionAbortController) {
        this.currentExecutionAbortController.abort(event.message);
      }
    } else if (event.type === 'question.request' ) {
      this.updateExecutionState({
        waitingOn: [...this.latestExecutionState!.waitingOn, event],
      });
    } else if (event.type === "question.response") {
      this.updateExecutionState({
        waitingOn: this.latestExecutionState!.waitingOn.filter(item => item.requestId !== event.requestId),
      });
    }
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      events: this.events
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
     // When restoring the event state, we need to clean up the events to put the agent back into a usable this.
    const events: AgentEventEnvelope[] = data.events || [];
    const handledEvents = new Set<string>();
    for (const event of events) {
      if (event.type === "input.handled") handledEvents.add(event.requestId);
    }

    this.events = events.filter(event => {
      if (event.type === "agent.stopped") return false;
      return !(event.type === "input.received" && !handledEvents.has(event.requestId));
    });

    // TODO: this needs to restore a proper execution state
    this.latestExecutionState = {
      type: 'agent.execution',
      timestamp: Date.now(),
      running: false,
      busyWith: null,
      waitingOn: [],
      inputQueue: [],
      currentlyExecuting: null,
      statusLine: null
    };
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
