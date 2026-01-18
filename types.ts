import type {SerializableStateSlice} from "@tokenring-ai/app/StateManager";
import Agent from "./Agent.js";
import {ResetWhat} from "./AgentEvents.ts";
import {ParsedAgentConfig} from "./schema.ts";

export type TokenRingAgentCommand = {
  name?: string;
  description: string;
  execute: (
    input: string,
    agent: Agent,
  ) => Promise<void | string> | void | string;
  help: string;
};
export type HookConfig = {
  name: string;
  description: string;
  beforeChatCompletion?: HookCallback;
  afterChatCompletion?: HookCallback;
  afterTesting?: HookCallback;
  afterAgentInputComplete?: HookCallback;
};
export type HookType = "afterChatCompletion" | "beforeChatCompletion" | "afterAgentInputComplete";
export type HookCallback = (
  agent: Agent,
  ...args: any[]
) => Promise<void> | void;
export type AgentStateSlice = SerializableStateSlice & {
  reset?: (what: ResetWhat[]) => void;
  show: () => string[];
  transferStateFromParent?: (agent: Agent) => void;
}

export interface AgentCheckpointData {
  agentId: string;
  createdAt: number;
  config: ParsedAgentConfig;
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

