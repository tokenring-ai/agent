import Agent from "./Agent.js";
import AgentTeam from "./AgentTeam.js";

export type TokenRingChatCommand = {
  name?: string;
  description: string;
  execute: (input: string, agent: Agent) => Promise<void | string> | void | string;
  help: () => string | string[];
  // allow arbitrary extras
  [key: string]: unknown;
};
export type HookConfig = {
  name: string;
  packageName: string;
  description: string;
  beforeChatCompletion?: HookCallback;
  afterChatCompletion?: HookCallback;
  afterTesting?: HookCallback;
}
export type HookType = "afterChatCompletion" | "beforeChatCompletion";
export type HookCallback = (agent: Agent, ...args: any[]) => Promise<void> | void;
export type TokenRingToolDefinition = {
  name: string;
  description: string;
  execute: (input: object, agent: Agent) => Promise<string | object>;
  inputSchema: import("zod").ZodTypeAny;
  start?: (agent: Agent) => Promise<void>;
  stop?: (agent: Agent) => Promise<void>;
};
export type TokenRingTool = {
  packageName: string;
} & TokenRingToolDefinition;
export type TokenRingPackage = {
  name: string;
  version: string;
  description: string;
  start?: (agentTeam: AgentTeam) => Promise<void>;
  stop?: (agentTeam: AgentTeam) => Promise<void>;
  tools?: Record<string, TokenRingToolDefinition>;
  chatCommands?: Record<string, TokenRingChatCommand>;
  hooks?: Record<string, Omit<Omit<HookConfig, "name">, "packageName">>;
};

export type MemoryItemMessage = {
  role: "user" | "system";
  content: string;
};

export type AttentionItemMessage = {
  role: "user" | "system";
  content: string;
};

export interface TokenRingService {
  name: string;
  description: string;

  start?(agentTeam: AgentTeam): Promise<void>;

  stop?(agentTeam: AgentTeam): Promise<void>;

  attach?(agent: Agent): Promise<void>;

  detach?(agent: Agent): Promise<void>;

  getMemories?(agent: Agent): AsyncGenerator<MemoryItemMessage>;

  getAttentionItems?(agent: Agent): AsyncGenerator<AttentionItemMessage>;
}