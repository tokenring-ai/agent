import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import {z} from "zod";
import {AgentEventEnvelope, AgentEventEnvelopeSchema, InputExecutionStateSchema, type ParsedAgentStatus, type ParsedInputReceived} from "../AgentEvents.js";
import {AgentStateSlice} from "../types.ts";

export const agentMessages = {
  agentStarting: "Agent starting...",
  noTasks: "Agent idle",
  agentShutdown: "Agent is shut down",
};

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
  currentActivity = agentMessages.agentStarting
  inputQueue: InputQueueItem[] = [];
  currentlyExecutingInputItem: InputQueueItem | null = null;

  get idle(): boolean {
    return this.inputQueue.length === 0;
  }

  events: AgentEventEnvelope[] = [];

  constructor() {
    super("AgentEventState", serializationSchema);
  }

  pushAgentStatus(): void {
    this.events.push({
      type: "agent.status",
      timestamp: Date.now(),
      inputExecutionQueue: this.inputQueue.map(item => item.request.requestId),
      status: this.status,
      currentActivity: this.currentActivity
    });
  };

  pushInputExecution(item: InputQueueItem): void {
    this.emit({
      type: "input.execution",
      timestamp: Date.now(),
      requestId: item.request.requestId,
      status: item.executionState.status,
      currentActivity: item.executionState.currentActivity,
      availableInteractions: item.executionState.availableInteractions,
    });
  }

  emit(event: AgentEventEnvelope): void {
    switch (event.type) {
      case "input.execution": {
        this.events.push(event);
        if (event.status === "finished") {
          this.inputQueue = this.inputQueue.filter(item => item.request.requestId !== event.requestId);
          if (this.currentlyExecutingInputItem?.request.requestId === event.requestId) {
            this.currentlyExecutingInputItem = null;
          }
          if (this.inputQueue.length === 0) {
            this.currentActivity = agentMessages.noTasks;
          }
        } else {
          if (this.currentlyExecutingInputItem?.request.requestId === event.requestId) {
            this.currentlyExecutingInputItem.executionState.status = event.status;
            if (event.currentActivity) {
              this.currentlyExecutingInputItem.executionState.currentActivity = event.currentActivity;
            }
            if (event.availableInteractions) {
              this.currentlyExecutingInputItem.executionState.availableInteractions = event.availableInteractions;
            }
            this.currentActivity = this.currentlyExecutingInputItem.executionState.currentActivity;
          } else {
            throw new Error("Input execution finished outside of a currently executing task in the Agent event loop, and will be discarded");
          }

          /*const inputQueueItem = this.inputQueue.find(item => item.request.requestId === event.requestId);
          if (inputQueueItem) {
            inputQueueItem.executionState.status = event.status;
            inputQueueItem.executionState.currentActivity = event.currentActivity ?? inputQueueItem.executionState.currentActivity;
            inputQueueItem.executionState.availableInteractions = event.availableInteractions ?? inputQueueItem.executionState.availableInteractions;
          } else {
            throw new Error("Input execution finished outside of a currently executing task in the Agent event loop, and will be discarded");
          }*/
          //this.currentActivity = this.currentlyExecutingInputItem?.executionState.currentActivity ?? this.currentActivity
        }
        this.pushAgentStatus();
      } break;
      case "input.received": {
        this.events.push(event);
        const activityMessage = `Running command ${intelligentTruncate(event.input.message, {maxLength: 256, maxLines: 1})}`

        this.inputQueue.push({
          request: event,
          interactionCallbacks: new Map(),
          executionState: {
            status: "queued",
            currentActivity: activityMessage,
            availableInteractions: []
          },
          abortController: new AbortController(),
        });
        this.events.push({
          type: "input.execution",
          timestamp: Date.now(),
          requestId: event.requestId,
          status: "queued",
          currentActivity: activityMessage,
          availableInteractions: []
        });
        this.pushAgentStatus();
      } break;
      case 'input.interaction': {
        const inputQueueItem = this.inputQueue.find(item => item.request.requestId === event.requestId);
        if (inputQueueItem) {
          const callback = inputQueueItem.interactionCallbacks.get(event.interactionId);
          if (callback) {
            this.events.push(event);
            inputQueueItem.executionState.availableInteractions = inputQueueItem.executionState.availableInteractions
              .filter((interaction) => interaction.interactionId !== event.interactionId);
            this.events.push({
              type: "input.execution",
              timestamp: Date.now(),
              requestId: inputQueueItem.request.requestId,
              status: inputQueueItem.executionState.status,
              currentActivity: inputQueueItem.executionState.currentActivity,
              availableInteractions: inputQueueItem.executionState.availableInteractions
            });
            this.pushAgentStatus();
            callback(event.result);
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _foo: never = event;
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
