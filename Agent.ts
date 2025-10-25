import formatLogMessages from "@tokenring-ai/utility/formatLogMessage";
import {v4 as uuid} from "uuid";
import type {AgentEventEnvelope, AgentEvents, ResetWhat,} from "./AgentEvents.js";
import AgentTeam from "./AgentTeam.ts";
import type {HumanInterfaceRequest, HumanInterfaceResponse,} from "./HumanInterfaceRequest.js";
import AgentCommandService from "./services/AgentCommandService.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import {CommandHistoryState} from "./state/commandHistoryState.js";
import {HooksState} from "./state/hooksState.js";
import StateManager from "./StateManager.js";
import type {
  AgentCheckpointData,
  AgentConfig,
  AgentStateSlice,
  AskHumanInterface,
  ChatOutputStream,
  ServiceRegistryInterface,
  TokenRingService
} from "./types.js";


export default class Agent
	implements
		AskHumanInterface,
		ChatOutputStream,
    ServiceRegistryInterface {
  readonly name = "Agent";
  readonly description = "Agent implementation";

  readonly id: string = uuid();
  debugEnabled = false;
  requireServiceByType: <R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ) => R;
  getServiceByType: <R extends TokenRingService>(
    type: abstract new (...args: any[]) => R,
  ) => R | undefined;
  readonly team!: AgentTeam;
  options: AgentConfig;
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

  constructor(agentTeam: AgentTeam, options: AgentConfig) {
    this.team = agentTeam;
    this.options = options;
    this.requireServiceByType = this.team.requireService;
    this.getServiceByType = this.team.getService;
  }

  get state() {
    return {
      entries: () => this.stateManager.entries(),
    };
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

    for (const service of this.team.getServices()) {
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
    for (const message of this.options.initialCommands ?? []) {
      this.emit("input.received", {message});
      await agentCommandService.executeAgentCommand(this, message);
    }

    this.setIdle();
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
    this.stateManager.forEach((_itemName, item) => {
      item.reset(what);
    });
    this.emit("reset", {what});
  }

  async askHuman<T extends keyof HumanInterfaceResponse>(
    request: HumanInterfaceRequest & { type: T },
  ): Promise<HumanInterfaceResponse[T]> {
    const sequence = this.sequenceCounter++;
    this.emit("human.request", {request, sequence});

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

  debugLine = (...msgs: string[]) => {
    if (this.debugEnabled) {
      this.systemMessage(formatLogMessages(msgs), "info");
    }
  };

  sendHumanResponse = (sequence: number, response: any) => {
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
  ): void {
    const envelope = {type, data} as AgentEventEnvelope;
    this.eventLog.push(envelope);
    let waiters = this.eventWaiters;
    this.eventWaiters = [];
    for (const waiter of waiters) {
      waiter(envelope);
    }
  }
}
