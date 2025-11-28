import {TokenRingService} from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {v4 as uuid} from "uuid";
import {z} from "zod";
import type {AgentEventEnvelope, AgentEvents, ResetWhat,} from "./AgentEvents.js";
import TokenRingApp from "@tokenring-ai/app";
import type {
  HumanInterfaceRequest,
  HumanInterfaceRequestFor,
  HumanInterfaceResponse,
  HumanInterfaceResponseFor, HumanInterfaceType,
} from "./HumanInterfaceRequest.js";
import AgentCommandService from "./services/AgentCommandService.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import {CommandHistoryState} from "./state/commandHistoryState.js";
import {HooksState} from "./state/hooksState.js";
import StateManager from "@tokenring-ai/app/StateManager";
import type {
  AgentCheckpointData,
  AgentConfig,
  AgentStateSlice,
  AskHumanInterface,
  ChatOutputStream,
  ServiceRegistryInterface
} from "./types.js";


export default class Agent
  implements AskHumanInterface,
    ChatOutputStream,
    ServiceRegistryInterface {
  readonly name;
  readonly description;

  readonly id: string = uuid();
  debugEnabled = false;
  requireServiceByType: <R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ) => R;
  getServiceByType: <R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ) => R | undefined;
  readonly app: TokenRingApp;
  readonly config: AgentConfig;

  stateManager = new StateManager<AgentStateSlice>();
  initializeState = this.stateManager.initializeState.bind(this.stateManager);
  mutateState = this.stateManager.mutateState.bind(this.stateManager);
  getState = this.stateManager.getState.bind(this.stateManager);
  private sequenceCounter = 0;
  private abortController = new AbortController();
  // Async event stream
  private eventLog: AgentEventEnvelope[] = [];
  private eventWaiters: Array<(ev: AgentEventEnvelope) => void> = [];
  // Map of pending human responses
  private pendingHumanResponses = new Map<number, (response: any) => void>();

  constructor(app: TokenRingApp, config: AgentConfig) {
    this.app = app;
    this.config = config;
    this.name = config.name;
    this.description = config.description;
    this.debugEnabled = config.debug ?? false;
    this.requireServiceByType = this.app.requireService;
    this.getServiceByType = this.app.getService;
  }

  get state() {
    return {
      entries: () => this.stateManager.entries(),
    };
  }

  runCommand(command: string): Promise<void> {
    const agentCommandService = this.requireServiceByType(AgentCommandService);
    return agentCommandService.executeAgentCommand(this, command);
  }

  restoreCheckpoint({state}: AgentCheckpointData): void {
    this.stateManager.deserialize(state.agentState, (key) => {
      this.systemMessage(`State slice ${key} not found in agent state`);
    });
  }

  generateCheckpoint(): AgentCheckpointData {
    return {
      agentId: this.id,
      createdAt: Date.now(),
      state: {
        agentState: this.stateManager.serialize(),
      },
    };
  }


  /**
   * Initialize the agent with commands and services
   */
  async initialize(initialState: Record<string, AgentStateSlice> = {}): Promise<void> {
    this.initializeState(CommandHistoryState, {});
    this.initializeState(HooksState, {});

    for (const service of this.app.getServices()) {
      if (service.attach) await service.attach(this);
    }

    for (const itemName in initialState) {
      const newItem = this.stateManager.state.get(itemName);
      if (newItem) {
        this.infoLine(`Copying persistent state item ${itemName} to agent`);
        newItem.deserialize(initialState[itemName].serialize());
      }
    }

    const agentCommandService = this.requireServiceByType(AgentCommandService);
    for (const message of this.config.initialCommands ?? []) {
      this.emit("input.received", {message});
      await agentCommandService.executeAgentCommand(this, message);
    }

    this.setIdle();
  }


  getAgentConfigSlice<T extends z.ZodTypeAny>(key: string, schema: T): z.infer<T> {
    try {
      return schema.parse(this.config[key as keyof AgentConfig]);
    } catch (error) {
      throw new Error(
        `Invalid config value for key "${key}": ${(error as Error).message}`,
      );
    }
  }



  /**
   * Handle input from the user.
   * @param message
   */
  async handleInput({message}: { message: string }): Promise<void> {
    try {
      message = message.trim();
      this.emit("input.received", {message});

      this.mutateState(CommandHistoryState, (state) => {
        state.commands.push(message);
      });

      await this.requireServiceByType(AgentCommandService).executeAgentCommand(this, message);
    } catch (err) {
      if (!this.abortController?.signal?.aborted) {
        // Only output an error if the command wasn't aborted
        this.systemMessage(`Error running command: ${err}`, "error");
      }
    } finally {
      await this.getServiceByType(AgentLifecycleService)?.executeHooks(this, "afterAgentInputComplete", message);
      this.setIdle();
    }
  }

  // Async generator for events
  async* events(
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
    this.emit("output.chat", {content});
  }

  reasoningOutput(content: string) {
    this.emit("output.reasoning", {content});
  }

  systemMessage(message: string, level: "info" | "warning" | "error" = "info") {
    this.emit("output.system", {message, level});
  }

  setBusy(message: string) {
    this.emit("state.busy", {message});
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
    this.emit("state.aborted", {reason});
    this.abortController.abort(reason);
  }

  reset(what: ResetWhat[]) {
    this.stateManager.forEach(item => item.reset(what))
    this.emit("reset", {what});
  }

  async askHuman<T extends HumanInterfaceType>(
    request: HumanInterfaceRequestFor<T>,
  ): Promise<HumanInterfaceResponseFor<T>> {
    const sequence = this.sequenceCounter++;
    this.emit("human.request", { request: request as HumanInterfaceRequest, sequence });

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
  infoLine = (...messages: string[]) =>
    this.systemMessage(formatLogMessages(messages), "info");

  warningLine = (...messages: string[]) =>
    this.systemMessage(formatLogMessages(messages), "warning");

  errorLine = (...messages: (string | Error)[]) =>
    this.systemMessage(formatLogMessages(messages), "error");

  debugLine = (...messages: string[]) => {
    if (this.debugEnabled) {
      this.systemMessage(formatLogMessages(messages), "info");
    }
  };

  sendHumanResponse = (sequence: number, response: HumanInterfaceResponse) => {
    // Resolve the corresponding pending human request
    const resolver = this.pendingHumanResponses.get(sequence);
    if (resolver) {
      this.pendingHumanResponses.delete(sequence);
      resolver(response);
      // Also emit a human.response event for visibility
      this.emit("human.response", {responseTo: sequence, response});
    }
  };

  getAbortSignal() {
    return this.abortController.signal;
  }

  private emit<K extends keyof AgentEvents>(
    type: K,
    data: AgentEvents[K],
    timestamp: number = Date.now(),
  ): void {
    const envelope = {type, data, timestamp} as AgentEventEnvelope;
    this.eventLog.push(envelope);
    let waiters = this.eventWaiters;
    this.eventWaiters = [];
    for (const waiter of waiters) {
      waiter(envelope);
    }
  }
}
