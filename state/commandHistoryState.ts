import type {ResetWhat} from "../AgentEvents.js";
import type {SerializableStateSlice} from "../StateManager.js";

export class CommandHistoryState implements SerializableStateSlice {
  name = "CommandHistoryState";
  commands: string[] = [];

  constructor({commands}: { commands?: string[] }) {
    this.commands = commands ? [...commands] : [];
  }

  reset(what: ResetWhat[]): void {
    // Doesn't reset
  }

  serialize(): object {
    return {
      commands: this.commands,
    };
  }

  deserialize(data: any): void {
    this.commands = data.commands ? [...data.commands] : [];
  }

  show(): string[] {
    return [
      `Commands: ${this.commands.length}`,
      ...this.commands.slice(-5).map((cmd, i) => `  [${this.commands.length - 5 + i + 1}] ${cmd}`)
    ];
  }
}
