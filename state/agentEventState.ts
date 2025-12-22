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
      busyWith: this.busyWith,
      idle: this.idle
    };
  }

  deserialize(data: any): void {
    this.events = data.events ? [...data.events] : [];
    this.busyWith = data.busyWith ?? null;
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
