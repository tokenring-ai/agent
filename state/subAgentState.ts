import type {ResetWhat} from "../AgentEvents.js";
import type {ParsedAgentConfig} from "../schema.ts";
import {AgentStateSlice} from "../types.ts";
import {z} from "zod";

const serializationSchema = z.object({
  allowedSubAgents: z.array(z.string()).default([])
}).prefault({});

export class SubAgentState implements AgentStateSlice<typeof serializationSchema> {
  readonly name = "SubAgentState";
  serializationSchema = serializationSchema;
  allowedSubAgents: string[] = [];

  constructor(readonly initialConfig: ParsedAgentConfig) {
    this.allowedSubAgents = [...initialConfig.allowedSubAgents];
  }

  reset(what: ResetWhat[]): void {
    if (what.includes("settings")) {
      this.allowedSubAgents = [...this.initialConfig.allowedSubAgents];
    }
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      allowedSubAgents: this.allowedSubAgents,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.allowedSubAgents = data.allowedSubAgents;
  }

  show(): string[] {
    return [
      `Allowed SubAgents: ${this.allowedSubAgents.length > 0 ? this.allowedSubAgents.join(", ") : "None"}`
    ];
  }
}
