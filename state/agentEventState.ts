import {z} from "zod";
import {AgentEventEnvelope, HumanRequestSchema, InputReceivedSchema, ResetWhat} from "../AgentEvents.js";
import {AgentStateSlice} from "../types.ts";

export type AgentEventCursor = {
  position: number,
}

export class AgentEventState implements AgentStateSlice {
  name = "AgentEventState";
  events: AgentEventEnvelope[] = [];

  constructor({events}: { events?: AgentEventEnvelope[] }) {
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
      events: this.events
    };
  }

  deserialize(data: any): void {
     // When restoring the event state, we need to clean up the events to put the agent back into a usable state.
    const events = data.events || [];
    const handledEvents = new Set<string>();
    for (const event of events as AgentEventEnvelope[]) {
      if (event.type === "input.handled") handledEvents.add(event.requestId);
    }

    this.events = (events as AgentEventEnvelope[]).filter(event => {
      if (event.type === "agent.stopped") return false;
      if (event.type === "input.received" && ! handledEvents.has(event.requestId)) return false;
      return true;
    });
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
