import formatLogMessages from "@tokenring-ai/utility/formatLogMessage";
import RegistryMultiSelector from "@tokenring-ai/utility/RegistryMultiSelector";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import type {
	AgentEventEnvelope,
	AgentEvents,
	ResetWhat,
} from "./AgentEvents.js";
import AgentTeam, { type NamedTool } from "./AgentTeam.ts";
import type {
	HumanInterfaceRequest,
	HumanInterfaceResponse,
} from "./HumanInterfaceRequest.js";
import { CommandHistoryState } from "./state/commandHistoryState.js";
import type { HookConfig, HookType, TokenRingService } from "./types.js";

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

export interface StateStorageInterface {
	getState<T extends AgentStateSlice>(ClassType: new (...args: any[]) => T): T;

	mutateState<R, T extends AgentStateSlice>(
		ClassType: new (...args: any[]) => T,
		callback: (state: T) => R,
	): R;

	initializeState<S, T extends AgentStateSlice>(
		ClassType: new (props: S) => T,
		props: S,
	): void;
}

export interface ServiceRegistryInterface {
	requireServiceByType<R extends TokenRingService>(
		type: abstract new (...args: any[]) => R,
	): R;

	getServiceByType<R extends TokenRingService>(
		type: abstract new (...args: any[]) => R,
	): R | undefined;
}

export interface AgentStateSlice {
	name: string;
	reset: (what: ResetWhat[]) => void;
	serialize: () => object;
	deserialize: (data: object) => void;
	persistToSubAgents?: boolean;
}

export const AgentConfigSchema = z.object({
	name: z.string(),
	description: z.string(),
	visual: z.object({
		color: z.string(),
	}),
	workHandler: z
		.function({
			input: z.tuple([z.string(), z.any()]),
			output: z.any(),
		})
		.optional(),
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

export default class Agent
	implements
		AskHumanInterface,
		ChatOutputStream,
		StateStorageInterface,
		ServiceRegistryInterface
{
	readonly name = "Agent";
	readonly description = "Agent implementation";

	readonly id: string = uuid();
	state = new Map<string, AgentStateSlice>();
	tools: RegistryMultiSelector<NamedTool>;
	hooks: RegistryMultiSelector<HookConfig>;
	//contextStorage = new ContextStorage();
	requireServiceByType: <R extends TokenRingService>(
		type: abstract new (...args: any[]) => R,
	) => R;
	getServiceByType: <R extends TokenRingService>(
		type: abstract new (...args: any[]) => R,
	) => R | undefined;
	readonly team!: AgentTeam;
	options: AgentConfig;
	private sequenceCounter = 0;
	private abortController = new AbortController();

	// Async event stream
	private eventLog: AgentEventEnvelope[] = [];
	private eventWaiters: Array<(ev: AgentEventEnvelope) => void> = [];

	// Map of pending human responses
	private pendingHumanResponses = new Map<number, (response: any) => void>();

	constructor(agentTeam: AgentTeam, options: AgentConfig) {
		this.team = agentTeam;
		this.options = options;
		this.tools = new RegistryMultiSelector(agentTeam.tools);
		this.hooks = new RegistryMultiSelector(agentTeam.hooks);
		this.requireServiceByType = this.team.services.requireItemByType;
		this.getServiceByType = this.team.services.getItemByType;
	}

	restoreCheckpoint({ state }: AgentCheckpointData): void {
		//this.contextStorage.fromJSON(state.contextStorage || []);
		this.tools.setEnabledItems(state.toolsEnabled || []);
		this.hooks.setEnabledItems(state.hooksEnabled || []);
		for (const key in state.agentState) {
			const slice = this.state.get(key);
			if (slice) {
				slice.deserialize(state.agentState[key]);
			} else {
				this.systemMessage(`State slice ${key} not found in agent state`);
			}
		}
	}

	generateCheckpoint(): AgentCheckpointData {
		return {
			agentId: this.id,
			createdAt: Date.now(),
			state: {
				//contextStorage: this.contextStorage.toJSON(),
				agentState: Object.fromEntries(
					Array.from(this.state.entries()).map(([key, slice]) => [
						key,
						slice.serialize(),
					]),
				),
				toolsEnabled: Array.from(this.tools.getActiveItemNames()),
				hooksEnabled: Array.from(this.hooks.getActiveItemNames()),
			},
		};
	}

	initializeState<S, T extends AgentStateSlice>(
		ClassType: new (props: S) => T,
		props: S,
	): void {
		this.state.set(ClassType.name, new ClassType(props));
	}

	mutateState<R, T extends AgentStateSlice>(
		ClassType: new (...args: any[]) => T,
		callback: (state: T) => R,
	): R {
		const state = this.state.get(ClassType.name) as T;
		if (!state) {
			throw new Error(`State slice ${ClassType.name} not found`);
		}

		return callback(state);
	}

	getState<T extends AgentStateSlice>(ClassType: new (...args: any[]) => T): T {
		const stateSlice = this.state.get(ClassType.name);
		if (stateSlice) {
			return stateSlice as T;
		} else {
			throw new Error(`State slice ${ClassType.name} not found`);
		}
	}

	/**
	 * Initialize the agent with commands and services
	 */
	async initialize(): Promise<void> {
		this.initializeState(CommandHistoryState, {});

		for (const service of this.team.services.getItems()) {
			if (service.attach) await service.attach(this);
		}

		for (const message of this.options.initialCommands ?? []) {
			this.emit("input.received", { message });
			await this.runCommand(message);
		}

		this.setIdle();
	}

	async executeHooks(hookType: HookType, ...args: any[]): Promise<void> {
		const hooks = this.hooks.getActiveItemEntries();
		for (const [, hook] of Object.entries(hooks)) {
			await hook[hookType]?.(this, ...args);
		}
	}

	/**
	 * Handle input from the user.
	 * @param message
	 */
	async handleInput({ message }: { message: string }): Promise<void> {
		try {
			message = message.trim();
			this.emit("input.received", { message });

			this.mutateState(CommandHistoryState, (state) => {
				state.commands.push(message);
			});

			await this.runCommand(message);
		} catch (err) {
			if (!this.abortController?.signal?.aborted) {
				// Only output an error if the command wasn't aborted
				this.systemMessage(`Error running command: ${err}`, "error");
			}
		} finally {
			await this.executeHooks("afterAgentInputComplete", message);
			this.setIdle();
		}
	}

	async runCommand(message: string): Promise<void> {
		let commandName = "chat";
		let remainder = message
			.replace(/^\s*\/(\S*)/, (_unused, matchedCommandName) => {
				commandName = matchedCommandName;
				return "";
			})
			.trim();

		commandName = commandName || "help";

		// Get command from agent's chat commands
		const commands = this.team.chatCommands.getAllItems();
		let command = commands[commandName];

		if (!command && commandName.endsWith("s")) {
			// If the command name is plural, try it singular as well
			command = commands[commandName.slice(0, -1)];
		}

		if (command) {
			await command.execute(remainder, this);
		} else {
			this.systemMessage(
				`Unknown command: /${commandName}. Type /help for a list of commands.`,
				"error",
			);
		}
	}

	// Async generator for events
	async *events(
		signal: AbortSignal,
	): AsyncGenerator<AgentEventEnvelope, void, unknown> {
		let sequence = 0;
		while (!signal.aborted) {
			if (this.eventLog.length > sequence) {
				const event = this.eventLog[sequence];
				sequence++;

				if (event.type === "state.idle" || event.type === "state.busy") {
					if (sequence !== this.eventLog.length) {
						continue;
					}
				}
				yield event;
			} else {
				await new Promise((resolve) => {
					this.eventWaiters.push(resolve);
				});
			}
		}
	}

	chatOutput(content: string) {
		this.emit("output.chat", { content });
	}

	reasoningOutput(content: string) {
		this.emit("output.reasoning", { content });
	}

	systemMessage(message: string, level: "info" | "warning" | "error" = "info") {
		this.emit("output.system", { message, level });
	}

	setBusy(message: string) {
		this.emit("state.busy", { message });
	}

	setNotBusy() {
		this.emit("state.notBusy", {});
	}

	setIdle() {
		this.emit("state.idle", {});
	}

	requestExit() {
		this.emit("state.exit", {});
	}

	requestAbort(reason: string) {
		this.emit("state.aborted", { reason });
		this.abortController.abort(reason);
	}

	reset(what: ResetWhat[]) {
		// Apply reset to internal state first
		for (const state of this.state.values()) {
			state.reset(what);
		}
		// Also notify listeners
		this.emit("reset", { what });
	}

	async askHuman<T extends keyof HumanInterfaceResponse>(
		request: HumanInterfaceRequest & { type: T },
	): Promise<HumanInterfaceResponse[T]> {
		const sequence = this.sequenceCounter++;
		this.emit("human.request", { request, sequence });

		return new Promise((resolve) => {
			this.pendingHumanResponses.set(sequence, resolve);
		});
	}

	async busyWhile<T>(message: string, awaitable: Promise<T>): Promise<T> {
		this.setBusy(message);
		try {
			return await awaitable;
		} finally {
			this.setNotBusy();
		}
	}

	// Legacy method aliases for compatibility
	infoLine = (...msgs: string[]) =>
		this.systemMessage(formatLogMessages(msgs), "info");

	warningLine = (...msgs: string[]) =>
		this.systemMessage(formatLogMessages(msgs), "warning");

	errorLine = (...msgs: (string | Error)[]) =>
		this.systemMessage(formatLogMessages(msgs), "error");

	sendHumanResponse = (sequence: number, response: any) => {
		// Resolve the corresponding pending human request
		const resolver = this.pendingHumanResponses.get(sequence);
		if (resolver) {
			this.pendingHumanResponses.delete(sequence);
			resolver(response);
			// Also emit a human.response event for visibility
			this.emit("human.response", { responseTo: sequence, response });
		}
	};

	getAbortSignal() {
		return this.abortController.signal;
	}

	private emit<K extends keyof AgentEvents>(
		type: K,
		data: AgentEvents[K],
	): void {
		const envelope = { type, data } as AgentEventEnvelope;
		this.eventLog.push(envelope);
		let waiters = this.eventWaiters;
		this.eventWaiters = [];
		for (const waiter of waiters) {
			waiter(envelope);
		}
	}
}
