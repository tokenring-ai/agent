import deepClone from "@tokenring-ai/utility/object/deepClone";
import deepMerge from "@tokenring-ai/utility/object/deepMerge";
import {z} from "zod";
import {type ParsedSubAgentConfig, SubAgentConfigSchema} from "../schema.ts";
import {AgentStateSlice} from "../types.ts";

const serializationSchema = SubAgentConfigSchema;

export class SubAgentState extends AgentStateSlice<typeof serializationSchema> {
  config: ParsedSubAgentConfig;

  constructor(readonly initialConfig: ParsedSubAgentConfig) {
    super("SubAgentState", serializationSchema);

    this.config = deepClone(initialConfig);
  }

  reset(): void {
    this.config = deepClone(this.initialConfig)
  }

  serialize(): z.output<typeof serializationSchema> {
    return deepClone(this.config);
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.config = deepMerge(this.config, data);
  }

  show(): string[] {
    return [
      `Allowed SubAgents: ${this.config.allowedSubAgents.length > 0 ? this.config.allowedSubAgents.join(", ") : "None"}`
    ];
  }
}
