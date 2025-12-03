import type {SerializableStateSlice} from "@tokenring-ai/app/StateManager";
import {TokenRingService} from "@tokenring-ai/app/types";
import {z} from "zod";
import Agent from "./Agent.js";
import {ResetWhat} from "./AgentEvents.ts";
import type {HumanInterfaceRequestFor, HumanInterfaceResponseFor, HumanInterfaceType} from "./HumanInterfaceRequest.js";

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
export type MessageLevel = "info" | "warning" | "error";

export interface ChatOutputStream {
  systemMessage(message: string, level?: MessageLevel): void;

  chatOutput(content: string): void;

  reasoningOutput(content: string): void;

  infoLine(...messages: string[]): void;

  warningLine(...messages: string[]): void;

  errorLine(...messages: (string | Error)[]): void;
}

export interface AskHumanInterface {
  askHuman<T extends HumanInterfaceType>(
    request: HumanInterfaceRequestFor<T>,
  ): Promise<HumanInterfaceResponseFor<T>>;
}

export interface ServiceRegistryInterface {
  requireServiceByType<R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ): R;

  getServiceByType<R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ): R | undefined;
}

export type AgentStateSlice = SerializableStateSlice & {
  reset: (what: ResetWhat[]) => void;
  show: () => string[];
  persistToSubAgents?: boolean;
}

export const AgentConfigSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  category: z.string(),
  debug: z.boolean().optional(),
  visual: z.object({
    color: z.string(),
  }),
  workHandler: z.function({
    input: z.tuple([z.string(), z.any()]),
    output: z.any()
  }).optional(),
  initialCommands: z.array(z.string()).default([]),
  persistent: z.boolean().optional(),
  storagePath: z.string().optional(),
  type: z.enum(["interactive", "background"]),
  callable: z.boolean().default(true),
  idleTimeout: z.number().optional().default(86400), // In seconds
  maxRunTime: z.number().optional().default(1800), // In seconds
});
export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;

export interface AgentCheckpointData {
  agentId: string;
  createdAt: number;
  state: {
    agentState: Record<string, object>;
  };
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

