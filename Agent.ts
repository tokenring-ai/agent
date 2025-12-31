import {TokenRingService} from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {v4 as uuid} from "uuid";
import {z} from "zod";
import {
  AgentEventEnvelope,
  HumanRequestSchema,
  HumanResponseSchema,
  ResetWhat,
} from "./AgentEvents.js";
import TokenRingApp from "@tokenring-ai/app";
import type {
  HumanInterfaceRequestFor,
  HumanInterfaceResponse,
  HumanInterfaceResponseFor, HumanInterfaceType,
} from "./HumanInterfaceRequest.js";
import AgentCommandService from "./services/AgentCommandService.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import {AgentEventState} from "./state/agentEventState.ts";
import {CommandHistoryState} from "./state/commandHistoryState.js";
import {CostTrackingState} from "./state/costTrackingState.ts";
import {HooksState} from "./state/hooksState.js";
import StateManager from "@tokenring-ai/app/StateManager";
import {TodoState} from "./state/todoState.ts";
import {
  AgentCheckpointData,
  AgentConfig, AgentConfigSchema,
  AgentStateSlice,
  AskHumanInterface,
  ChatOutputStream, ParsedAgentConfig,
  ServiceRegistryInterface
} from "./types.js";
import {formatAgentId} from "./util/formatAgentId.ts";


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
  readonly config: ParsedAgentConfig;
  headless: boolean;

  stateManager = new StateManager<AgentStateSlice>();
  initializeState = this.stateManager.initializeState.bind(this.stateManager);
  mutateState = this.stateManager.mutateState.bind(this.stateManager);
  getState = this.stateManager.getState.bind(this.stateManager);
  subscribeState = this.stateManager.subscribe.bind(this.stateManager);
  waitForState = this.stateManager.waitForState.bind(this.stateManager);
  timedWaitForState = this.stateManager.timedWaitForState.bind(this.stateManager);
  subscribeStateAsync = this.stateManager.subscribeAsync.bind(this.stateManager);

  private agentShutdownSignal = new AbortController();

  constructor(readonly app: TokenRingApp, {config, headless} : {config: AgentConfig, headless: boolean}) {
    this.config = AgentConfigSchema.parse(config);
    this.headless = headless
    this.name = config.name;
    this.description = config.description;
    this.debugEnabled = config.debug ?? false;
    this.requireServiceByType = this.app.requireService;
    this.getServiceByType = this.app.getService;

    this.initializeState(AgentEventState, {
      events: [
        { type: "agent.created", timestamp: Date.now()}
      ]
    });
    this.initializeState(CommandHistoryState, {});
    this.initializeState(HooksState, {});
    this.initializeState(CostTrackingState, {});
    this.initializeState(TodoState, {});
  }

  static async createAgentFromCheckpoint(app: TokenRingApp, checkpoint: AgentCheckpointData, { headless } : { headless: boolean }) {
    const agent = new Agent(app, {config: checkpoint.config, headless});
    
    for (const service of app.getServices()) {
      if (service.attach) await service.attach(agent);
    }

    agent.restoreState(checkpoint.state);

    agent.systemMessage(`Recovered agent from checkpoint: ${formatAgentId(agent.id)}`);
    
    return agent;
  }

  shutdown(reason: string) {
    this.requestAbort(reason);

    this.agentShutdownSignal.abort();

    this.infoLine(`Agent was shutdown: ${reason}`);
  }


  generateCheckpoint(): AgentCheckpointData {
    return {
      agentId: this.id,
      createdAt: Date.now(),
      config: this.config,
      state: this.stateManager.serialize()
    };
  }

  restoreState(state: AgentCheckpointData["state"]) {
    this.stateManager.deserialize(state, (key) => {
      this.systemMessage(`State slice ${key} not found in agent state`);
    });
  }

  /**
   * Initialize the agent with commands and services
   */
  async initialize(initialState: Record<string, AgentStateSlice> = {}): Promise<void> {
    for (const service of this.app.getServices()) {
      if (service.attach) await service.attach(this);
    }

    for (const itemName in initialState) {
      const newItem = this.stateManager.state.get(itemName);
      if (newItem) {
        newItem.deserialize(initialState[itemName].serialize());
      }
    }

    this.app.trackPromise(signal => this.run(signal));

    if (this.config.initialCommands.length > 0) {
      this.mutateState(AgentEventState, (state) => {
        for (const message of this.config.initialCommands) {
          state.events.push({type: "input.received", message: message.trim(), requestId: uuid(), timestamp: Date.now()});
        }
      })
    }
  }

  // noinspection JSUnusedGlobalSymbols
  runCommand(command: string) {
    return this.requireServiceByType(AgentCommandService).executeAgentCommand(this, command);
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

  addCost(category: string, amount: number) {
    this.mutateState(CostTrackingState, (state) => {
      state.costs[category] = (state.costs[category] ?? 0) + amount;
    });
  }


  /**
   * Handle input from the user.
   * @param message
   * @returns A unique request ID for the input. This can be used to track the status of the request, e.g. to cancel it.
   */
  handleInput({message}: { message: string }): string {
    const requestId = uuid();
    message = message.trim();
    
    this.mutateState(AgentEventState, (state) => {
      state.emit({type: "input.received", message, requestId, timestamp: Date.now()});
    });

    this.mutateState(CommandHistoryState, (state) => {
      state.commands.push(message);
    });

    return requestId;
  }


  chatOutput(message: string) {
    this.emit({ type: "output.chat", message, timestamp: Date.now() });
  }

  reasoningOutput(message: string) {
    this.emit({ type: "output.reasoning", message, timestamp: Date.now() });
  }

  systemMessage(message: string, level: "info" | "warning" | "error" = "info") {
    if (!message.endsWith("\n")) message = `${message}\n`;
    switch (level) {
      case "error":
        this.emit({ type: "output.error", message, timestamp: Date.now() });
        break;
      case "warning":
        this.emit({ type: "output.warning", message, timestamp: Date.now() });
        break;
      case "info":
        this.emit({ type: "output.info", message, timestamp: Date.now() });
        break;
    }
  }

  getIdleDuration(): number {
    const events = this.getState(AgentEventState).events;

    const lastActivityTime = events[events.length - 1]?.timestamp;

    return lastActivityTime ? Date.now() - lastActivityTime : Infinity;
  }

  getRunDuration(): number {
    const events = this.getState(AgentEventState).events;

    const firstActivityTime = events[0]?.timestamp;
    return firstActivityTime ? Date.now() - firstActivityTime : 0
  }

  requestAbort(reason: string) {
    this.mutateState(AgentEventState, (state) => {
      if (! state.idle) {
        state.emit({type: "abort", timestamp: Date.now(), reason});
        state.emit({type: "output.info", message: `Aborting current operation, ${reason}`, timestamp: Date.now()});
      }
    });
  }

  reset(what: ResetWhat[]) {
    this.stateManager.forEach(item => item.reset(what))
    this.emit({ type: "reset", what, timestamp: Date.now() });
  }

  async askHuman<T extends HumanInterfaceType>(
    request: HumanInterfaceRequestFor<T>,
  ): Promise<HumanInterfaceResponseFor<T>> {
    if (this.headless) {
      throw new Error("Cannot ask human for feedback when agent is running in headless mode");
    }

    let requestId = uuid();
    this.mutateState(AgentEventState, (state) => {
      const event: z.infer<typeof HumanRequestSchema> = {type: "human.request", request: request, id: requestId, timestamp: Date.now()};
      state.emit(event);
      state.waitingOn = event;
    })

    return new Promise((resolve) => {
      const unsubscribe = this.subscribeState(AgentEventState, (state) => {
        const event = state.events.find(event => event.type === "human.response" && event.requestId === requestId) as z.infer<typeof HumanResponseSchema>;
        if (event) {
          unsubscribe()
          resolve(event.response);
        }
      })
    });
  }

  async busyWhile<T>(message: string, awaitable: Promise<T> | (() => Promise<T>)): Promise<T> {
    if (typeof awaitable === "function") awaitable = awaitable();
    this.mutateState(AgentEventState, (state) => state.busyWith = message);
    try {
      return await awaitable;
    } finally {
      this.mutateState(AgentEventState, (state) => state.busyWith = null);
    }
  }

  setBusyWith(message: string | null) {
    this.mutateState(AgentEventState, (state) => {
      state.busyWith = message;
    })
  }

  setStatusLine(status: string | null) {
    this.mutateState(AgentEventState, (state) => {
      state.statusLine = status;
    })
  }

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

  sendHumanResponse = (requestId: string, response: HumanInterfaceResponse) => {
    this.mutateState(AgentEventState, (state) => {
      state.waitingOn = null;
      state.events.push({type: "human.response", requestId, response, timestamp: Date.now()});
    });
  };

  getAbortSignal() {
    const state = this.getState(AgentEventState);
    return state.currentlyExecuting?.abortController.signal || this.agentShutdownSignal.signal;
  }

  async run(signal: AbortSignal): Promise<void> {
    signal.addEventListener('abort', () => this.agentShutdownSignal.abort());
    const eventCursor = { position: 0 };

    for await (const state of this.subscribeStateAsync(AgentEventState, this.agentShutdownSignal.signal)) {
      for (const event of state.yieldEventsByCursor(eventCursor)) {
        if (event.type === "input.received") {
          this.mutateState(AgentEventState, (s) => {
            s.inputQueue.push(event);
          });
        } else if (event.type === "abort") {
          this.handleAbort();
        }
      }
      
      if (!state.currentlyExecuting && state.inputQueue.length > 0) {
        this.startNextExecution();
      }
    }

    this.emit({
      type: "agent.stopped",
      timestamp: Date.now()
    })
  }

  private handleAbort(reason?: string): void {
    this.mutateState(AgentEventState, (state: AgentEventState) => {
      const requestId = state.currentlyExecuting?.requestId;

      if (state.currentlyExecuting) {
        state.currentlyExecuting.abortController.abort(reason || "Abort requested");
      }

      for (const item of state.inputQueue.filter(r => r.requestId !== requestId)) {
        state.emit({
          type: "input.handled",
          requestId: item.requestId,
          status: "cancelled",
          message: "Aborted",
          timestamp: Date.now(),
        });
      }
    });
  }

  private startNextExecution(): void {
    const agentCommandService = this.requireServiceByType(AgentCommandService);
    const agentLifecycleService = this.getServiceByType(AgentLifecycleService);

    const state = this.getState(AgentEventState);
    const item = state.inputQueue[0];
    if (!item) return;

    const itemAbortController = new AbortController();
    const handleAgentAbort = () => itemAbortController.abort();
    this.agentShutdownSignal.signal.addEventListener('abort', handleAgentAbort);

    this.mutateState(AgentEventState, (s) => {
      s.currentlyExecuting = { requestId: item.requestId, abortController: itemAbortController };
    });

    this.app.trackPromise(async () => {
      try {
        await agentCommandService.executeAgentCommand(this, item.message);
        await agentLifecycleService?.executeHooks(this, "afterAgentInputComplete", item.message);


        this.mutateState(AgentEventState, (s) => {
          s.emit({
            type: "input.handled",
            requestId: item.requestId,
            status: "success",
            message: "Request completed successfully",
            timestamp: Date.now(),
          });
        });
      } catch (err) {
        const status = itemAbortController.signal.aborted ? "cancelled" : "error";
        this.mutateState(AgentEventState, (s) => {
          s.emit({
            type: "input.handled",
            requestId: item.requestId,
            status,
            message: formatLogMessages([err as Error]),
            timestamp: Date.now(),
          });
        });
      } finally {
        this.agentShutdownSignal.signal.removeEventListener('abort', handleAgentAbort);
        this.mutateState(AgentEventState, (s) => {
          s.currentlyExecuting = null;
          s.inputQueue = s.inputQueue.filter(i => i.requestId !== item.requestId);
        });
      }
    });
  }


  private emit(event: AgentEventEnvelope): void {
    this.mutateState(AgentEventState, (state) => state.emit(event));
  }
}
