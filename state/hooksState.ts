import type {ResetWhat} from "../AgentEvents.js";
import type {ParsedAgentConfig} from "../schema.ts";
import {AgentStateSlice} from "../types.ts";
import {z} from "zod";

const serializationSchema = z.object({
  enabledHooks: z.array(z.string()).default([])
}).prefault({});

export class HooksState implements AgentStateSlice<typeof serializationSchema> {
  name = "HooksState";
  serializationSchema = serializationSchema;
  enabledHooks: string[] = [];

  constructor(readonly initialConfig: ParsedAgentConfig) {
    this.enabledHooks = [...initialConfig.enabledHooks];
  }

  reset(what: ResetWhat[]): void {
    if (what.includes("settings")) {
      this.enabledHooks = [...this.initialConfig.enabledHooks];
    }
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
