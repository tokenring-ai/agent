import {z} from "zod";
import {AgentStateSlice} from "../types.ts";

const serializationSchema = z.object({
  commands: z.array(z.string()).default([])
}).prefault({});

export class CommandHistoryState implements AgentStateSlice<typeof serializationSchema> {
  readonly name = "CommandHistoryState";
  serializationSchema = serializationSchema;
  commands: string[] = [];

  constructor({commands}: { commands?: string[] }) {
    this.commands = commands ? [...commands] : [];
  }

  reset(): void {
          this.commands = [];
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      commands: this.commands,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.commands = data.commands;
  }

  show(): string[] {
    return [
      `Commands: ${this.commands.length}`,
      ...this.commands.slice(-5).map((cmd, i) => `  [${this.commands.length - 5 + i + 1}] ${cmd}`)
    ];
  }
}
