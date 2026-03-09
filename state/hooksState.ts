import type {StateSnapshot} from "@tokenring-ai/app/StateManager";
import {z} from "zod";
import type {ParsedAgentConfig} from "../schema.ts";
import {AgentStateSlice} from "../types.ts";

const serializationSchema = z.object({
  enabledHooks: z.array(z.string()).default([])
}).prefault({});

export class HooksState extends AgentStateSlice<typeof serializationSchema> {
  enabledHooks: string[] = [];
  constructor(readonly initialConfig: ParsedAgentConfig) {
    super("HooksState", serializationSchema);
    this.enabledHooks = [...initialConfig.enabledHooks];
  }

  reset(): void {
          this.enabledHooks = [...this.initialConfig.enabledHooks];
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      enabledHooks: this.enabledHooks,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.enabledHooks = data.enabledHooks;
  }

  show(): string[] {
    return [
      `Enabled Hooks: ${this.enabledHooks.length > 0 ? this.enabledHooks.join(", ") : "None"}`
    ];
  }
}
