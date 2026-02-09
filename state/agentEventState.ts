import {AgentEventEnvelope, AgentEventEnvelopeSchema} from "../AgentEvents.js";
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
  events: AgentEventEnvelope[] = [];

  constructor({events}: { events?: AgentEventEnvelope[] }) {
    this.events = events ? [...events] : [];
  }

  emit(event: AgentEventEnvelope): void {
    this.events.push(event);
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      events: this.events
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
     // When restoring the event state, we need to clean up the events to put the agent back into a usable state.
    const events: AgentEventEnvelope[] = data.events || [];
    const handledEvents = new Set<string>();
    for (const event of events) {
      if (event.type === "input.handled") handledEvents.add(event.requestId);
    }

    this.events = events.filter(event => {
      if (event.type === "agent.stopped") return false;
      return !(event.type === "input.received" && !handledEvents.has(event.requestId));

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
