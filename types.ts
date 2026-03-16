import {SerializableStateSlice} from "@tokenring-ai/app/StateManager";
import z, {ZodTypeAny} from "zod";
import Agent from "./Agent.js";
import {InputAttachment} from "./AgentEvents.ts";

export type TokenRingBaseAgentCommand = {
  name: string;
  aliases?: string[];
  description: string;
  help: string;
};

export type AgentCommandArgumentSchema = {
  type: "string" | "number" | "flag";
  description: string;
  required?: boolean;
};

export type AgentCommandArgumentsSchema = Record<string, AgentCommandArgumentSchema>;

export type AgentCommandPromptSchema = {
  description: string;
  required?: boolean;
};

export type AgentCommandInputSchema = {
  args?: AgentCommandArgumentsSchema;
  prompt?: AgentCommandPromptSchema;
  allowAttachments: boolean;
};

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

type AgentCommandArgumentValue<Schema extends AgentCommandArgumentSchema> =
  Schema["type"] extends "flag"
    ? boolean
    : Schema["type"] extends "number"
      ? number
      : string;

type RequiredAgentCommandArgumentKeys<Schema extends AgentCommandArgumentsSchema> = {
  [Key in keyof Schema]: Schema[Key]["required"] extends true ? Key : never;
}[keyof Schema];

type OptionalAgentCommandArgumentKeys<Schema extends AgentCommandArgumentsSchema> =
  Exclude<keyof Schema, RequiredAgentCommandArgumentKeys<Schema>>;

export type AgentCommandArgsType<Schema extends AgentCommandArgumentsSchema> = Expand<
  { [Key in RequiredAgentCommandArgumentKeys<Schema>]-?: AgentCommandArgumentValue<Schema[Key]> } &
  { [Key in OptionalAgentCommandArgumentKeys<Schema>]?: AgentCommandArgumentValue<Schema[Key]> }
>;

type AgentCommandPromptInput<Schema extends AgentCommandInputSchema> =
  Schema["prompt"] extends AgentCommandPromptSchema
    ? Schema["prompt"]["required"] extends true
      ? { prompt: string }
      : { prompt?: string }
    : { prompt?: never };

type AgentCommandArgsInput<Schema extends AgentCommandInputSchema> =
  Schema["args"] extends AgentCommandArgumentsSchema
    ? { args: AgentCommandArgsType<Schema["args"]> }
    : { args?: never };

type AgentCommandAttachmentsInput<Schema extends AgentCommandInputSchema> =
  Schema["allowAttachments"] extends true
    ? { attachments: InputAttachment[] }
    : { attachments?: never };

export type AgentCommandInputType<Schema extends AgentCommandInputSchema> =
  { agent: Agent } &
  AgentCommandPromptInput<Schema> &
  AgentCommandArgsInput<Schema> &
  AgentCommandAttachmentsInput<Schema>;

export type TokenRingAgentCommand<InputSchema extends AgentCommandInputSchema = AgentCommandInputSchema> =
  TokenRingBaseAgentCommand & {
    inputSchema: InputSchema;
    execute(input: AgentCommandInputType<InputSchema>): Promise<string> | string;
  };

export abstract class AgentStateSlice<SerializationSchema extends ZodTypeAny> extends SerializableStateSlice<SerializationSchema> {
  abstract show(): string[];

  transferStateFromParent(agent: Agent) {}
}

export type AgentCreationContext = {
  items: string[];
}

export const AgentCheckpointSchema = z.object({
  agentId: z.string(),
  sessionId: z.string(),
  createdAt: z.number(),
  agentType: z.string(),
  state: z.record(z.string(), z.unknown()),
});

export type AgentCheckpointData = z.infer<typeof AgentCheckpointSchema>;
export type ContextItemPosition =
  | "afterSystemMessage"
  | "afterPriorMessages"
  | "afterCurrentMessage";

export type ContextItem = {
  role: "system" | "user";
  position: ContextItemPosition;
  content: string;
};
