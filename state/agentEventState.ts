import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import { z } from "zod";
import {
  type AgentEventEnvelope,
  AgentEventEnvelopeSchema,
  type InputExecutionStateSchema,
  type InteractionRequest,
  type ParsedAgentStatus,
  type ParsedInputReceived,
} from "../AgentEvents.js";
import { AgentStateSlice } from "../types.ts";
import { redactMaskedAnswer } from "../util/redactMaskedAnswer.ts";

export const agentMessages = {
  agentStarting: "Agent starting...",
  noTasks: "Agent idle",
  agentShutdown: "Agent is shut down",
};

const serializationSchema = z
  .object({
    events: z.array(AgentEventEnvelopeSchema).default([]),
    /** The session's title, and when it was set (so a branch from before then has none). */
    title: z.object({ text: z.string(), at: z.number() }).nullable().default(null),
  })
  .prefault({});

/** Longest session title kept. */
const MAX_TITLE_LENGTH = 80;

export type AgentEventCursor = {
  position: number;
};

export type InputQueueItem = {
  request: ParsedInputReceived;
  executionState: Required<Omit<z.output<typeof InputExecutionStateSchema>, "type" | "timestamp" | "requestId">>;
  interactionCallbacks: Map<string, (data: any) => void>;
  abortController: AbortController;
};

export class AgentEventState extends AgentStateSlice<typeof serializationSchema> {
  status: ParsedAgentStatus["status"] = "starting";
  currentActivity = agentMessages.agentStarting;
  inputQueue: InputQueueItem[] = [];
  currentlyExecutingInputItem: InputQueueItem | null = null;
  events: AgentEventEnvelope[] = [];

  constructor() {
    super("AgentEventState", serializationSchema);
  }

  get idle(): boolean {
    return this.inputQueue.length === 0;
  }

  pushAgentStatus(): void {
    this.events.push({
      type: "agent.status",
      timestamp: Date.now(),
      inputExecutionQueue: this.inputQueue.map(item => item.request.requestId),
      status: this.status,
      currentActivity: this.currentActivity,
    });
  }

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
      case "input.execution":
        {
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
              throw new Error(
                `Input execution status '${event.status}' received outside of a currently executing task in the Agent event loop, and will be discarded`,
              );
            }
          }
          this.pushAgentStatus();
        }
        break;
      case "input.received":
        {
          this.events.push(event);
          const activityMessage = `Running command ${intelligentTruncate(event.input.message, { maxLength: 256, maxLines: 1 })}`;

          this.inputQueue.push({
            request: event,
            interactionCallbacks: new Map(),
            executionState: {
              status: "queued",
              currentActivity: activityMessage,
              availableInteractions: [],
            },
            abortController: new AbortController(),
          });
          this.events.push({
            type: "input.execution",
            timestamp: Date.now(),
            requestId: event.requestId,
            status: "queued",
            currentActivity: activityMessage,
            availableInteractions: [],
          });
          this.pushAgentStatus();
        }
        break;
      case "input.interaction":
        {
          const inputQueueItem = this.inputQueue.find(item => item.request.requestId === event.requestId);
          if (inputQueueItem) {
            const callback = inputQueueItem.interactionCallbacks.get(event.interactionId);
            if (callback) {
              // The code that asked gets the real answer; the history keeps masked answers (keys, passwords) redacted.
              const interaction = inputQueueItem.executionState.availableInteractions.find(candidate => candidate.interactionId === event.interactionId);
              this.events.push({ ...event, result: redactMaskedAnswer(interaction, event.result) });
              inputQueueItem.executionState.availableInteractions = inputQueueItem.executionState.availableInteractions.filter(
                interaction => interaction.interactionId !== event.interactionId,
              );
              this.events.push({
                type: "input.execution",
                timestamp: Date.now(),
                requestId: inputQueueItem.request.requestId,
                status: inputQueueItem.executionState.status,
                currentActivity: inputQueueItem.executionState.currentActivity,
                availableInteractions: inputQueueItem.executionState.availableInteractions,
              });
              this.pushAgentStatus();
              callback(event.result);
            } else {
              throw new Error(`No callback registered for interaction ${event.interactionId}`);
            }
          } else {
            throw new Error("Input interaction received outside of a currently executing task in the Agent event loop, and will be discarded");
          }
        }
        break;
      default:
        this.events.push(event);
        break;
    }
  }

  /**
   * What the session is about: set once, from the first prompt the agent's model is given (see
   * runChat), so commands like `/tools enable …` never become a title.
   */
  title: { text: string; at: number } | null = null;

  /** Sets the title from a prompt, unless the session already has one. */
  setTitleOnce(prompt: string, at = Date.now()): void {
    if (this.title) return;
    const text = prompt.replace(/\s+/g, " ").trim();
    if (!text) return;
    this.title = { text: text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…` : text, at };
  }

  serialize(): z.output<typeof serializationSchema> {
    return { events: compressEvents(this.events), title: this.title };
  }

  /** The events up to and including `timestamp`. */
  serializeAt(timestamp: number): z.output<typeof serializationSchema> {
    return {
      events: compressEvents(this.events.filter(event => event.timestamp <= timestamp)),
      title: this.title && this.title.at <= timestamp ? this.title : null,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.title = data.title;
    // When restoring the event state, we need to clean up the events to put the agent back into a usable state.
    // Events keep their original timestamps: branching at a point in the conversation goes by them.
    const { events } = data;
    const receivedEvents = new Set<string>();
    for (const event of events) {
      if (event.type === "input.received") receivedEvents.add(event.requestId);
    }

    // The questions asked, so answers to masked ones can be redacted: histories saved before redaction existed
    // may still hold a key or password typed into one.
    const asked = new Map<string, InteractionRequest>();
    for (const event of events) {
      switch (event.type) {
        case "agent.status":
        case "agent.created":
        case "agent.stopped":
        case "cancel":
          break;
        case "input.execution":
          for (const interaction of event.availableInteractions ?? []) asked.set(interaction.interactionId, interaction);
          break;
        case "agent.response":
          receivedEvents.delete(event.requestId);
          this.events.push({ ...event });
          break;
        case "input.received":
          receivedEvents.add(event.requestId);
          this.events.push({ ...event });
          break;
        case "output.info":
        case "output.warning":
        case "output.error":
        case "output.chat":
        case "output.reasoning":
        case "toolCall":
          this.events.push({ ...event });
          break;
        case "input.interaction":
          this.events.push({ ...event, result: redactMaskedAnswer(asked.get(event.interactionId), event.result) });
          break;
        default: {
          const exhaustive: any = event satisfies never;
          throw new Error(`Unhandled event type: ${exhaustive.type}`);
        }
      }
    }

    for (const requestId of receivedEvents) {
      this.emit({
        type: "agent.response",
        requestId: requestId,
        status: "cancelled",
        message: "Command was in a mid-execution state during checkpoint restore and was cancelled.",
        timestamp: Date.now(),
      });
    }
  }

  show(): string {
    return `Events: ${this.events.length}`;
  }

  getEventCursorFromCurrentPosition(): AgentEventCursor {
    return {
      position: this.events.length,
    };
  }

  *yieldEventsByCursor(cursor: AgentEventCursor): Generator<AgentEventEnvelope> {
    for (; cursor.position < this.events.length; cursor.position++) {
      yield this.events[cursor.position]!;
    }
  }
}

/** Joins streamed chat and reasoning chunks so a stored transcript holds one event per message. */
function compressEvents(events: readonly AgentEventEnvelope[]): AgentEventEnvelope[] {
  const compressedEvents: AgentEventEnvelope[] = [];
  let lastEvent: AgentEventEnvelope | undefined;

  for (const event of events) {
    if (event.type === "output.chat" || event.type === "output.reasoning") {
      if (lastEvent?.type === event.type) {
        lastEvent.message += event.message;
        continue;
      }
    }

    compressedEvents.push((lastEvent = { ...event }));
  }

  return compressedEvents;
}
