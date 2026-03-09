import {z} from "zod";
import type {ParsedAgentConfig} from "../schema.ts";
import {AgentStateSlice} from "../types.ts";

const serializationSchema = z.object({
  allowedSubAgents: z.array(z.string()).default([])
}).prefault({});

export class SubAgentState extends AgentStateSlice<typeof serializationSchema> {
  allowedSubAgents: string[] = [];

  constructor(readonly initialConfig: ParsedAgentConfig) {
    super("SubAgentState", serializationSchema);
    this.allowedSubAgents = [...initialConfig.allowedSubAgents];
  }

  reset(): void {
          this.allowedSubAgents = [...this.initialConfig.allowedSubAgents];
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
