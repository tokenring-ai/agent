import {SerializableStateSlice} from "@tokenring-ai/app/StateManager";
import z, {type ZodType} from "zod";
import type Agent from "./Agent.ts";
import type {InputAttachment} from "./AgentEvents.ts";

export type TokenRingBaseAgentCommand = {
  name: string;
  aliases?: string[];
  description: string;
  help: string;
};

export type AgentCommandArgumentSchema =
  | {
  type: "string";
  description: string;
  defaultValue?: string;
  minimum?: number;
  maximum?: number;
  required?: false;
}
  | {
  type: "string";
  description: string;
  defaultValue?: never;
  minimum?: number;
  maximum?: number;
  required: true;
}
  | {
  type: "number";
  description: string;
  defaultValue?: number;
  minimum?: number;
  maximum?: number;
  required?: false;
}
  | {
  type: "number";
  description: string;
  defaultValue?: never;
  minimum?: number;
  maximum?: number;
  required: true;
}
  | {
  type: "flag";
  description: string;
  required?: never;
};

export type AgentCommandArgumentsSchema = Record<
  string,
  AgentCommandArgumentSchema
>;

export type AgentCommandPositionalSchema =
  | {
  name: string;
  description: string;
  required?: false;
  defaultValue?: string;
}
  | {
  name: string;
  description: string;
  required: true;
  defaultValue?: never;
};

export type AgentCommandRemainderSchema =
  | {
  name: string;
  description: string;
  required: true;
  defaultValue?: never;
}
  | {
  name: string;
  description: string;
  required?: false;
  defaultValue?: string;
};

export type AgentCommandInputSchema = {
  args?: AgentCommandArgumentsSchema;
  positionals?: readonly AgentCommandPositionalSchema[];
  remainder?: AgentCommandRemainderSchema;
  allowAttachments?: boolean;
};

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

type AgentCommandArgumentValue<Schema extends AgentCommandArgumentSchema> =
  Schema["type"] extends "flag"
    ? boolean
    : Schema["type"] extends "number"
      ? number
      : string;

type AgentCommandArgumentHasDefault<Schema extends AgentCommandArgumentSchema> =
  Schema extends { defaultValue: AgentCommandArgumentValue<Schema> }
    ? true
    : false;

type RequiredAgentCommandArgumentKeys<
  Schema extends AgentCommandArgumentsSchema,
> = {
  [Key in keyof Schema]: Schema[Key]["required"] extends true
    ? Key
    : AgentCommandArgumentHasDefault<Schema[Key]> extends true
      ? Key
      : never;
}[keyof Schema];

type OptionalAgentCommandArgumentKeys<
  Schema extends AgentCommandArgumentsSchema,
> = Exclude<keyof Schema, RequiredAgentCommandArgumentKeys<Schema>>;

export type AgentCommandArgsType<Schema extends AgentCommandArgumentsSchema> =
  Expand<
    {
      [Key in RequiredAgentCommandArgumentKeys<Schema>]-?: AgentCommandArgumentValue<
      Schema[Key]
    >;
    } & {
    [Key in OptionalAgentCommandArgumentKeys<Schema>]?: AgentCommandArgumentValue<
      Schema[Key]
    >;
  }
  >;

type RequiredAgentCommandPositionals<
  Schema extends readonly AgentCommandPositionalSchema[],
> = Extract<Schema[number], { required: true } | { defaultValue: string }>;

type OptionalAgentCommandPositionals<
  Schema extends readonly AgentCommandPositionalSchema[],
> = Exclude<Schema[number], RequiredAgentCommandPositionals<Schema>>;

export type AgentCommandPositionalsType<
  Schema extends readonly AgentCommandPositionalSchema[],
> = Expand<
  {
    [Positional in RequiredAgentCommandPositionals<Schema> as Positional["name"]]-?: string;
  } & {
  [Positional in OptionalAgentCommandPositionals<Schema> as Positional["name"]]?: string;
}
>;

type AgentCommandPositionalsInput<Schema extends AgentCommandInputSchema> =
  Schema["positionals"] extends readonly AgentCommandPositionalSchema[]
    ? { positionals: AgentCommandPositionalsType<Schema["positionals"]> }
    : { positionals?: never };

type AgentCommandRemainderInput<Schema extends AgentCommandInputSchema> =
  Schema["remainder"] extends AgentCommandRemainderSchema
    ? {
      remainder: Schema["remainder"]["required"] extends true
        ? string
        : Schema["remainder"]["defaultValue"] extends string
          ? string
          : string | undefined;
    }
    : { remainder?: never };

type AgentCommandArgsInput<Schema extends AgentCommandInputSchema> =
  Schema["args"] extends AgentCommandArgumentsSchema
    ? { args: AgentCommandArgsType<Schema["args"]> }
    : { args?: never };

type AgentCommandAttachmentsInput<Schema extends AgentCommandInputSchema> =
  Schema["allowAttachments"] extends true
    ? { attachments: InputAttachment[] }
    : { attachments?: never };

export type AgentCommandInputType<Schema extends AgentCommandInputSchema> = {
  agent: Agent;
} & AgentCommandPositionalsInput<Schema> &
  AgentCommandRemainderInput<Schema> &
  AgentCommandArgsInput<Schema> &
  AgentCommandAttachmentsInput<Schema>;

export type TokenRingAgentCommand<
  InputSchema extends AgentCommandInputSchema = AgentCommandInputSchema,
> = TokenRingBaseAgentCommand & {
  inputSchema: InputSchema;
  execute(input: AgentCommandInputType<InputSchema>): Promise<string> | string;
};

export abstract class AgentStateSlice<
  SerializationSchema extends ZodType,
> extends SerializableStateSlice<SerializationSchema> {
  abstract show(): string;

  transferStateFromParent(_agent: Agent) {
  }
}

export type AgentCreationContext = {
  items: string[];
};

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
