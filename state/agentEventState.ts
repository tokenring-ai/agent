import deepMerge from "@tokenring-ai/utility/object/deepMerge";
import {z} from "zod";
import {
  AgentEventEnvelope,
  AgentEventEnvelopeSchema,
  InputExecutionStateSchema,
  InputReceivedSchema,
  type ParsedAgentStatus,
  type ParsedInputReceived
} from "../AgentEvents.js";
import {AgentStateSlice} from "../types.ts";

const serializationSchema = z.object({
  events: z.array(AgentEventEnvelopeSchema).default([])
}).prefault({});

export type AgentEventCursor = {
  position: number,
}

export type InputQueueItem = {
  request: ParsedInputReceived,
  executionState: Required<Omit<z.output<typeof InputExecutionStateSchema>, "type" | "timestamp" | "requestId">>,
  interactionCallbacks: Map<string, (data: any) => void>,
  abortController: AbortController;
}

export class AgentEventState extends AgentStateSlice<typeof serializationSchema> {
  status: ParsedAgentStatus["status"] = "starting";
  inputQueue: InputQueueItem[] = [];
  currentlyExecutingInputItem: InputQueueItem | null = null;

  get idle(): boolean {
    return this.inputQueue.length === 0;
  }

  events: AgentEventEnvelope[] = [];

  constructor({}: {}) {
    super("AgentEventState", serializationSchema);
  }

  pushAgentStatus(): void {
    this.events.push({
      type: "agent.status",
      timestamp: Date.now(),
      inputExecutionQueue: this.inputQueue.map(item => item.request.requestId),
      status: this.status
    });
  };

  emit(event: AgentEventEnvelope): void {
    switch (event.type) {
      case "input.execution": {
        this.events.push(event);
        if (event.status === "finished") {
          this.inputQueue = this.inputQueue.filter(item => item.request.requestId !== event.requestId);
          if (this.currentlyExecutingInputItem?.request.requestId === event.requestId) {
            this.currentlyExecutingInputItem = null;
          }
        } else {
          const inputQueueItem = this.inputQueue.find(item => item.request.requestId === event.requestId);
          if (inputQueueItem) {
            Object.assign(inputQueueItem.executionState, event);
          } else {
            throw new Error("Input execution finished outside of a currently executing task in the Agent event loop, and will be discarded");
          }
        }
        this.pushAgentStatus();
      } break;
      case "input.received": {
        this.events.push(event);
        this.inputQueue.push({
          request: event,
          interactionCallbacks: new Map(),
          executionState: {
            status: "queued",
            currentActivity: "Task is queued",
            availableInteractions: []
          },
          abortController: new AbortController(),
        });
        this.pushAgentStatus();
      } break;
      case 'input.interaction': {
        const inputQueueItem = this.inputQueue.find(item => item.request.requestId === event.requestId);
        if (inputQueueItem) {
          const callback = inputQueueItem.interactionCallbacks.get(event.interactionId);
          if (callback) {
            this.events.push(event);
            callback("data" in event ? event.data : undefined);
          } else {
            throw new Error(`No callback registered for interaction ${event.interactionId}`);
          }
        } else {
          throw new Error("Input interaction received outside of a currently executing task in the Agent event loop, and will be discarded");
        }
      } break;
      default:
        this.events.push(event);
        break;
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
        case "agent.status":
        case "agent.created":
        case "agent.stopped":
        case "cancel":
        case "input.execution":
          break
        case "agent.response":
          receivedEvents.delete(event.requestId);
          this.events.push({...event, timestamp: Date.now()})
          break;
        case "input.received":
          receivedEvents.add(event.requestId);
          this.events.push({...event, timestamp: Date.now()})
          break;
        case "output.info":
        case "output.warning":
        case "output.error":
        case "output.chat":
        case "output.reasoning":
        case "output.artifact":
        case "input.interaction":
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
        type: "agent.response",
        requestId: requestId,
        status: 'cancelled',
        message: "Command was in a mid-execution state during checkpoint restore and was cancelled.",
        timestamp: Date.now(),
      });
    }
  }

  show(): string[] {
    return [
      `Events: ${this.events.length}`,
    ];
  }

  getEventCursorFromCurrentPosition(): AgentEventCursor {
    return {
      position: this.events.length
    }
  }

  * yieldEventsByCursor(cursor: AgentEventCursor): Generator<AgentEventEnvelope> {
    for (; cursor.position < this.events.length; cursor.position++) {
      yield this.events[cursor.position];
    }
  }
}
