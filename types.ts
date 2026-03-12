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

