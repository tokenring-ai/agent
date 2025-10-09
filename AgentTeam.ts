import Agent from "@tokenring-ai/agent/Agent";
import type {
  AgentConfig,
  HookConfig,
  TokenRingChatCommand,
  TokenRingPackage,
  TokenRingService,
  TokenRingToolDefinition,
} from "@tokenring-ai/agent/types";
import {tokenRingTool} from "@tokenring-ai/ai-client/util/tokenRingTool";
import formatLogMessages from "@tokenring-ai/utility/formatLogMessage";
import KeyedRegistry from "@tokenring-ai/utility/KeyedRegistry";
import TypedRegistry from "@tokenring-ai/utility/TypedRegistry";
import type {Tool} from "ai";
import {EventEmitter} from "eventemitter3";
import {z} from "zod";
import StateManager, {type StateStorageInterface} from "./StateManager.js";

export interface AgentPersistentStorage {
	storeState: (agent: Agent) => Promise<string>;
	loadState: (stateId: string, agentTeam: AgentTeam) => Promise<Agent>;
}

export type AgentTeamConfig = Record<string, any>;

export type NamedTool = {
	name: string;
	tool: Tool;
};


export default class AgentTeam implements TokenRingService, StateStorageInterface {
	name = "AgentTeam";
	description = "A team of AI agents that work together";

	packages = new KeyedRegistry<TokenRingPackage>();
	services = new TypedRegistry<TokenRingService>();
	chatCommands = new KeyedRegistry<TokenRingChatCommand>();
	tools = new KeyedRegistry<NamedTool>();
	hooks = new KeyedRegistry<HookConfig>();
	readonly events = new EventEmitter();
	private agentConfigRegistry = new KeyedRegistry<AgentConfig>();
	addAgentConfig = this.agentConfigRegistry.register;
	getAgentConfigs = this.agentConfigRegistry.getAllItems;
	private agentInstanceRegistry = new KeyedRegistry<Agent>();
	private agents: Map<string, Agent> = new Map();
  private config: AgentTeamConfig;
  private stateManager = new StateManager();

  constructor(config: AgentTeamConfig) {
    this.config = config;
  }

  initializeState = this.stateManager.initializeState.bind(this.stateManager);
  mutateState = this.stateManager.mutateState.bind(this.stateManager);
  getState = this.stateManager.getState.bind(this.stateManager);

  getConfigSlice<T extends z.ZodTypeAny>(key: string, schema: T): z.infer<T> {
    try {
      return schema.parse(this.config[key]);
    } catch (error) {
      throw new Error(`Invalid config value for key "${key}": ${(error as Error).message}`);
    }
  }


  /**
	 * Log a system message
	 */
	serviceOutput(...msgs: any[]): void {
		this.events.emit("serviceOutput", formatLogMessages(msgs));
	}

	serviceError(...msgs: any[]): void {
		this.events.emit("serviceError", formatLogMessages(msgs));
	}

	async addPackages(packages: TokenRingPackage[]) {
		for (const pkg of packages) {
      this.packages.register(pkg.name, pkg);

      if (pkg.install) await pkg.install(this);
    }

    for (const pkg of packages) {
      if (pkg.start) {
        await pkg.start(this);
      }
    }
  }

  addServices(...services: TokenRingService[]) {
    for (const service of services) {
      this.services.register(service);
    }
  }

  addTools(pkg: TokenRingPackage, tools: Record<string, TokenRingToolDefinition>) {
    for (const toolName in tools) {
      this.tools.register(
        `${pkg.name}/${toolName}`,
        tokenRingTool({...tools[toolName]}),
      );
    }
  }

  addChatCommands(chatCommands: Record<string, TokenRingChatCommand>) {
    for (const cmdName in chatCommands) {
      this.chatCommands.register(cmdName, chatCommands[cmdName]);
    }
  }

  addHooks(pkg: TokenRingPackage, hooks: Record<string, HookConfig>) {
    for (const hookName in hooks) {
      this.hooks.register(`${pkg.name}/${hookName}`, hooks[hookName]);
    }
  }

  addAgentConfigs(agentConfigs: Record<string, AgentConfig>) {
    for (const agentName in agentConfigs) {
      this.addAgentConfig(agentName, agentConfigs[agentName]);
    }
  }

	getAgentTypes(): string[] {
		return this.agentConfigRegistry.getAllItemNames();
	}

	async createAgent(type: string): Promise<Agent> {
		const agentConfig = this.agentConfigRegistry.getItemByName(type);
		if (!agentConfig) {
			throw new Error(`[${this.name}] Couldn't find agent of type "${type}"`);
		}

		const agent = new Agent(this, agentConfig);

		this.agentInstanceRegistry.register(agent.id, agent);
		this.agents.set(agent.id, agent);

		// noinspection ES6MissingAwait
		agent.initialize(); // Initialize the agent in the background
		return agent;
	}

	async deleteAgent(agent: Agent): Promise<void> {
		agent.requestAbort("AgentManager initiated shutdown");

		// Remove from registries and maps
		this.agentInstanceRegistry.unregister(agent.id);
		this.agents.delete(agent.id);
	}

	getAgents(): Agent[] {
		return Array.from(this.agents.values());
	}

	getAgent(id: string): Agent | undefined {
		return this.agents.get(id);
	}
}
