import {type InputReceived, type ParsedQuestionRequest, ResetWhat} from "../AgentEvents.js";
import {AgentStateSlice} from "../types.ts";

export class AgentExecutionState implements AgentStateSlice {
  name = "AgentExecutionState";
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

  serialize(): object {
    return {};
  }

  deserialize(data: any): void {}

  show(): string[] {
    return [
      `Busy With: ${this.busyWith ?? "None"}`,
      `Status Line: ${this.statusLine ?? "None"}`,
      `Idle: ${this.idle ? "Yes" : "No"}`,
    ];
  }
}
