import {z} from "zod";
import {AgentEventEnvelope, HumanRequestSchema, InputReceivedSchema, ResetWhat} from "../AgentEvents.js";
import type {SerializableStateSlice} from "@tokenring-ai/app/StateManager";

export type AgentEventCursor = {
  position: number,
}

export class AgentEventState implements SerializableStateSlice {
  name = "AgentEventState";
  busyWith: string | null = null;
  waitingOn: z.infer<typeof HumanRequestSchema> | null = null;
  events: AgentEventEnvelope[] = [];
  // These are not persisted, the agent calculates them on startup
  inputQueue: Array<z.infer<typeof InputReceivedSchema>> = [];
  currentlyExecuting: { requestId: string; abortController: AbortController } | null = null;

  constructor({events, busyWith}: { events?: AgentEventEnvelope[], busyWith?: string }) {
    this.busyWith = busyWith ?? null;
    this.events = events ? [...events] : [];
  }

  get idle(): boolean {
    return this.inputQueue.length === 0;
  }

  emit(event: AgentEventEnvelope): void {
    this.events.push(event);
  }

  reset(what: ResetWhat[]): void {
    // Doesn't reset
  }

  serialize(): object {
    return {
      events: this.events,
    };
  }

  deserialize(data: any): void {
     // When restoring the event state, we need to clean up the events to put the agent back into a usable state.
    const handledEvents = new Set<string>();
    for (const event of data.events as AgentEventEnvelope[]) {
      if (event.type === "input.handled") handledEvents.add(event.requestId);
    }

    this.events = (data.events as AgentEventEnvelope[]).filter(event => {
      if (event.type === "agent.stopped") return false;
      if (event.type === "input.received" && ! handledEvents.has(event.requestId)) return false;
      return true;
    });

    this.busyWith = null;
    this.waitingOn = null;
    this.currentlyExecuting = null;
  }

  show(): string[] {
    return [
      `Events: ${this.events.length}`,
      `Busy With: ${this.busyWith ?? "None"}`,
      `Idle: ${this.idle ? "Yes" : "No"}`,
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
