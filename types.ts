import {SerializableStateSlice} from "@tokenring-ai/app/StateManager";
import type {AnyZodObject} from "zod/v3";
import Agent from "./Agent.js";
import {InputAttachment} from "./AgentEvents.ts";
import type {HookCallback} from "./util/hooks.ts";
import z, {ZodTypeAny, type ZodAny, type ZodObject} from "zod";

export type TokenRingBaseAgentCommand = {
  name: string;
  aliases?: string[];
  description: string;
  help: string;
};
export type TokenRingAgentCommand = TokenRingBaseAgentCommand & (
  {
    allowAttachments: true;
    execute: (
      opts: { input: string; attachments: InputAttachment[] },
      agent: Agent,
    ) => Promise<string> | string;
  } | {
    execute: (
      input: string,
      agent: Agent,
    ) => Promise<string> | string;
    allowAttachments?: false;
  }
);

export type Hook = {
  type: "hook";
};

export type HookSubscription = {
  name: string;
  displayName: string;
  description: string;
  callbacks: HookCallback<any>[];
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

