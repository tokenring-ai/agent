import Agent, { type AgentConfig } from "@tokenring-ai/agent/Agent";
import type {
	HookConfig,
	TokenRingChatCommand,
	TokenRingPackage,
	TokenRingService,
	TokenRingTool,
} from "@tokenring-ai/agent/types";
import { tokenRingTool } from "@tokenring-ai/ai-client/util/tokenRingTool";
import formatLogMessages from "@tokenring-ai/utility/formatLogMessage";
import KeyedRegistry from "@tokenring-ai/utility/KeyedRegistry";
import TypedRegistry from "@tokenring-ai/utility/TypedRegistry";
import type { Tool } from "ai";
import { EventEmitter } from "eventemitter3";

export interface AgentPersistentStorage {
	storeState: (agent: Agent) => Promise<string>;
	loadState: (stateId: string, agentTeam: AgentTeam) => Promise<Agent>;
}

export type AgentTeamConfig = {
	persistentStorage: AgentPersistentStorage;
};

export type NamedTool = {
	name: string;
	tool: Tool;
};

export default class AgentTeam implements TokenRingService {
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
			if (pkg.chatCommands) {
				for (const [cmdName, command] of Object.entries(pkg.chatCommands)) {
					this.chatCommands.register(cmdName, command);
				}
			}
			if (pkg.tools) {
				for (const [toolName, tool] of Object.entries(pkg.tools)) {
					this.tools.register(
						`${pkg.name}/${toolName}`,
						tokenRingTool({ ...tool }),
					);
				}
			}
			if (pkg.hooks) {
				for (const [hookName, hook] of Object.entries(pkg.hooks)) {
					this.hooks.register(`${pkg.name}/${hookName}`, {
						...hook,
						name: hookName,
						packageName: pkg.name,
					});
				}
			}
			if (pkg.agents) {
				for (const agentName in pkg.agents) {
					this.addAgentConfig(agentName, pkg.agents[agentName]);
				}
			}
			if (pkg.start) await pkg.start(this);
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
