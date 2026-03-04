import type {SerializableStateSlice} from "@tokenring-ai/app/StateManager";
import Agent from "./Agent.js";
import {InputAttachment} from "./AgentEvents.ts";
import type {HookCallback} from "./util/hooks.ts";

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

export type AgentStateSlice<SerializationSchema> = SerializableStateSlice<SerializationSchema> & {
  reset?: () => void;
  show: () => string[];
  transferStateFromParent?: (agent: Agent) => void;
}

export type AgentCreationContext = {
  items: string[];
}

export interface AgentCheckpointData {
  agentId: string;
  sessionId: string;
  createdAt: number;
  agentType: string;
  state: Record<string, object>;
}

export type ContextItemPosition =
  | "afterSystemMessage"
  | "afterPriorMessages"
  | "afterCurrentMessage";
export type ContextItem = {
  role: "system" | "user";
  position: ContextItemPosition;
  content: string;
};

