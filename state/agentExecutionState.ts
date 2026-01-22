import {type InputReceived, type ParsedQuestionRequest, ResetWhat} from "../AgentEvents.js";
import {AgentStateSlice} from "../types.ts";
import {z} from "zod";

const serializationSchema = z.object({}).prefault({});

export class AgentExecutionState implements AgentStateSlice<typeof serializationSchema> {
  name = "AgentExecutionState";
  serializationSchema = serializationSchema;
  busyWith: string | null = null;
  waitingOn: Array<ParsedQuestionRequest> = []
  inputQueue: Array<InputReceived> = [];
  currentlyExecuting: { requestId: string; abortController: AbortController } | null = null;
  statusLine: string | null;

  constructor({busyWith, statusLine}: { busyWith?: string, statusLine?: string }) {
    this.busyWith = busyWith ?? null;
    this.statusLine = statusLine ?? null;
  }

  get idle(): boolean {
    return this.inputQueue.length === 0;
  }

  reset(what: ResetWhat[]): void {
    // Doesn't reset
  }

  serialize(): z.output<typeof serializationSchema> {
    return {};
  }

  deserialize(data: z.output<typeof serializationSchema>): void {}

  show(): string[] {
    return [
      `Busy With: ${this.busyWith ?? "None"}`,
      `Status Line: ${this.statusLine ?? "None"}`,
      `Idle: ${this.idle ? "Yes" : "No"}`,
    ];
  }
}
