import {AIConfig} from "@tokenring-ai/ai-client/AIService";
import formatLogMessages from "@tokenring-ai/utility/formatLogMessage";
import RegistryMultiSelector from "@tokenring-ai/utility/RegistryMultiSelector";
import {v4 as uuid} from 'uuid'
import {AgentEventEnvelope, AgentEvents, ResetWhat} from "./AgentEvents.js";
import AgentCheckpointService from "./AgentCheckpointService.js";
import {AgentCheckpointData} from "./AgentCheckpointProvider.js";
import AgentTeam from "./AgentTeam.ts";
//import ContextStorage from "./ContextStorage.js";
import {HumanInterfaceRequest} from "./HumanInterfaceRequest.js";
import {HookConfig, HookType, TokenRingService, TokenRingTool} from "./types.js";
import type {ChalkInstance} from "chalk";

export interface AgentConfig {
  name: string;
  description: string;
  visual: {
    color: keyof ChalkInstance;
  }
  ai: AIConfig;
  initialCommands: string[];
  persistent?: boolean;
  storagePath?: string;
}

export enum ColorName {
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  blackBright,
  redBright,
  greenBright,
  yellowBright,
  blueBright,
  magentaBright,
  cyanBright,
  whiteBright,
}

export interface AgentStateSlice {
  name: string;
  reset: (what: ResetWhat[]) => void;
  serialize: () => object;
  deserialize: (data: object) => void;
}


export default class Agent {
  readonly name = "Agent";
  readonly description = "Agent implementation";

  readonly id: string = uuid();
  state = new Map<string, AgentStateSlice>();
  tools: RegistryMultiSelector<TokenRingTool>;
  hooks: RegistryMultiSelector<HookConfig>;
  //contextStorage = new ContextStorage();
  requireFirstServiceByType: <R extends TokenRingService>(type: abstract new (...args: any[]) => R) => R;
  getFirstServiceByType: <R extends TokenRingService>(type: abstract new (...args: any[]) => R) => R | undefined;
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
    this.requireFirstServiceByType = this.team.services.requireFirstItemByType;
    this.getFirstServiceByType = this.team.services.getFirstItemByType;
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
          Array.from(this.state.entries()).map(([key, slice]) => [key, slice.serialize()])
        ),
        toolsEnabled: Array.from(this.tools.getActiveItemNames()),
        hooksEnabled: Array.from(this.hooks.getActiveItemNames()),
      }
    };
  }


  initializeState<S, T extends AgentStateSlice>(ClassType: new (props: S) => T, props: S): void {
    this.state.set(ClassType.name, new ClassType(props));
  }

  mutateState<R, T extends AgentStateSlice>(ClassType: new (...args: any[]) => T, callback: (state: T) => R): R {
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
    for (const service of this.team.services.getItems()) {
      if (service.attach) await service.attach(this);
    }

    for (const message of this.options.initialCommands ?? []) {
      await this.handleInput({message});
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
   * Executes a command on the agent
   */
  async handleInput({message}: { message: string }): Promise<void> {
    message = message.trim();

    let commandName = "chat";
    let remainder = message.replace(/^\s*\/(\S*)/, (_unused, matchedCommandName) => {
      commandName = matchedCommandName;
      return "";
    }).trim();

    try {
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
          'error'
        );
      }
    } catch (err) {
      if (!this.abortController?.signal?.aborted) {
        // Only output an error if the command wasn't aborted
        this.systemMessage(`Error running command: ${err}`, 'error');
      }
    } finally {
      this.setIdle();
    }
  }


  // Async generator for events
  async* events(signal: AbortSignal): AsyncGenerator<AgentEventEnvelope, void, unknown> {
    let sequence = 0;
    while (!signal.aborted) {
      if (this.eventLog.length > sequence) {
        const event = this.eventLog[sequence];
        sequence++;

        if (event.type === 'state.idle' || event.type === 'state.busy') {
          if (sequence !== this.eventLog.length) {
            continue;
          }
        }
        yield event;
      } else {
        await new Promise(resolve => {
          this.eventWaiters.push(resolve);
        });
      }
    }
  }

  chatOutput(content: string) {
    this.emit('output.chat', {content});
  }

  reasoningOutput(content: string) {
    this.emit('output.reasoning', {content});
  }

  systemMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    this.emit('output.system', {message, level});
  }

  setBusy(message: string) {
    this.emit('state.busy', {message});
  }

  setNotBusy() {
    this.emit('state.notBusy', {});
  }

  setIdle() {
    this.emit('state.idle', {});
  }

  requestAbort(reason: string) {
    this.emit('state.aborted', {reason});
    this.abortController.abort(reason);
  }

  reset(what: ResetWhat[]) {
    // Apply reset to internal state first
    for (const state of this.state.values()) {
      state.reset(what);
    }
    // Also notify listeners
    this.emit('reset', {what});

    // Auto-save after reset
    this.autoSave();
  }

  async askHuman(request: HumanInterfaceRequest): Promise<any> {
    const sequence = this.sequenceCounter++;
    this.emit('human.request', {request, sequence});

    return new Promise(resolve => {
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
  infoLine = (...msgs: string[]) => this.systemMessage(formatLogMessages(msgs), 'info');

  warningLine = (...msgs: string[]) => this.systemMessage(formatLogMessages(msgs), 'warning');

  errorLine = (...msgs: (string | Error)[]) => this.systemMessage(formatLogMessages(msgs), 'error');

  sendHumanResponse = (sequence: number, response: any) => {
    // Resolve the corresponding pending human request
    const resolver = this.pendingHumanResponses.get(sequence);
    if (resolver) {
      this.pendingHumanResponses.delete(sequence);
      resolver(response);
      // Also emit a human.response event for visibility
      this.emit('human.response', {responseTo: sequence, response});
    }
  };

  getAbortSignal() {
    return this.abortController.signal;
  }

  private autoSave(): void {
    const storage = this.getFirstServiceByType(AgentCheckpointService);
    if (storage) {
      setTimeout(() => storage.saveAgentCheckpoint("Autosaved Checkpoint", this), 0);
    }
  }

  private emit<K extends keyof AgentEvents>(type: K, data: AgentEvents[K]): void {
    const envelope = {type, data} as AgentEventEnvelope;
    this.eventLog.push(envelope);
    let waiters = this.eventWaiters;
    this.eventWaiters = [];
    for (const waiter of waiters) {
      waiter(envelope);
    }

    // Auto-save on certain events
    if (type === 'state.idle' || type === 'human.response' || type === 'reset') {
      this.autoSave();
    }
  }

}
