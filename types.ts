import type {Tool} from "ai";
import {z} from "zod";
import Agent from "./Agent.js";
import AgentTeam from "./AgentTeam.js";
import type {HumanInterfaceRequest, HumanInterfaceResponse} from "./HumanInterfaceRequest.js";
import type {StateSlice} from "./StateManager.js";

export type TokenRingChatCommand = {
	name?: string;
	description: string;
	execute: (
		input: string,
		agent: Agent,
	) => Promise<void | string> | void | string;
	help: () => string | string[];
	// allow arbitrary extras
	[key: string]: unknown;
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
export type TokenRingToolDefinition = {
	name: string;
	description: string;
	execute: (input: object, agent: Agent) => Promise<string | object>;
	inputSchema: Tool["inputSchema"];
	start?: (agent: Agent) => Promise<void>;
	stop?: (agent: Agent) => Promise<void>;
};
export type TokenRingTool = {
	packageName: string;
} & TokenRingToolDefinition;
export type MessageLevel = "info" | "warning" | "error";

export interface ChatOutputStream {
  systemMessage(message: string, level?: MessageLevel): void;

  chatOutput(content: string): void;

  reasoningOutput(content: string): void;

  infoLine(...msgs: string[]): void;

  warningLine(...msgs: string[]): void;

  errorLine(...msgs: (string | Error)[]): void;
}

export interface AskHumanInterface {
  askHuman<T extends keyof HumanInterfaceResponse>(
    request: HumanInterfaceRequest & { type: T },
  ): Promise<HumanInterfaceResponse[T]>;
}

export interface ServiceRegistryInterface {
  requireServiceByType<R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ): R;

  getServiceByType<R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ): R | undefined;
}

export type AgentStateSlice = StateSlice;
export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  visual: z.object({
    color: z.string(),
  }),
  workHandler: z.function({
    input: z.tuple([z.string(), z.any()]),
    output: z.any()
  }).optional(),
  ai: z.any(),
  initialCommands: z.array(z.string()),
  persistent: z.boolean().optional(),
  storagePath: z.string().optional(),
  type: z.enum(["interactive", "background"]),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface AgentCheckpointData {
  agentId: string;
  createdAt: number;
  state: {
    //contextStorage: object;
    agentState: Record<string, object>;
    toolsEnabled: string[];
    hooksEnabled: string[];
  };
}

export type TokenRingPackage = {
	name: string;
	version: string;
	description: string;
  //start?: (agentTeam: AgentTeam) => Promise<void>;
  //stop?: (agentTeam: AgentTeam) => Promise<void>;
  //tools?: Record<string, TokenRingToolDefinition>;
  //chatCommands?: Record<string, TokenRingChatCommand>;
  //hooks?: Record<string, Omit<Omit<HookConfig, "name">, "packageName">>;
	agents?: Record<string, AgentConfig>;

  install?: (agentTeam: AgentTeam) => Promise<void> | void;
  start?: (agentTeam: AgentTeam) => Promise<void> | void;
};

export type ContextItemPosition =
	| "afterSystemMessage"
	| "afterPriorMessages"
	| "afterCurrentMessage";
export type ContextItem = {
	role: "system" | "user";
	position: ContextItemPosition;
	content: string;
};

export interface TokenRingService {
	name: string; // Must match class name
	description: string;

	start?(agentTeam: AgentTeam): Promise<void>;

	stop?(agentTeam: AgentTeam): Promise<void>;

	attach?(agent: Agent): Promise<void>;

	detach?(agent: Agent): Promise<void>;

	getContextItems?(agent: Agent): AsyncGenerator<ContextItem>;
}
