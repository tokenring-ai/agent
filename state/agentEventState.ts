import type {AgentEventEnvelope, HumanRequestEnvelope, ResetWhat} from "../AgentEvents.js";
import type {SerializableStateSlice} from "@tokenring-ai/app/StateManager";

export type AgentEventCursor = {
  position: number,
}

export class AgentEventState implements SerializableStateSlice {
  name = "AgentEventState";
  busyWith: string | null = null;
  idle: boolean = false;
  waitingOn: HumanRequestEnvelope | null = null;
  events: AgentEventEnvelope[] = [];

  constructor({events, busyWith, idle}: { events?: AgentEventEnvelope[], busyWith?: string, idle?: boolean }) {
    this.busyWith = busyWith ?? null;
    this.idle = idle ?? false;
    this.events = events ? [...events] : [];
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
    this.idle = data.idle ?? false;
  }

  show(): string[] {
    return [
      `Events: ${this.events.length}`,
      `Busy With: ${this.busyWith ?? "None"}`,
      `Idle: ${this.idle ? "Yes" : "No"}`,
      ...this.events.slice(-5).map((event, i) => `  [${this.events.length - 5 + i + 1}] ${event.type}: ${JSON.stringify(event.data)}`)
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
