import TokenRingApp from "@tokenring-ai/app";
import StateManager from "@tokenring-ai/app/StateManager";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import {v4 as uuid} from "uuid";
import {z} from "zod";
import {
  AgentEventEnvelope,
  HumanRequestSchema,
  HumanResponseSchema,
  OutputArtifactSchema,
  ResetWhat,
} from "./AgentEvents.js";
import type {
  HumanInterfaceRequestFor,
  HumanInterfaceResponse,
  HumanInterfaceResponseFor,
  HumanInterfaceType,
} from "./HumanInterfaceRequest.js";
import {AgentConfig, AgentConfigSchema, ParsedAgentConfig} from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import {AgentEventState} from "./state/agentEventState.ts";
import {AgentExecutionState} from "./state/agentExecutionState.ts";
import {CommandHistoryState} from "./state/commandHistoryState.js";
import {CostTrackingState} from "./state/costTrackingState.ts";
import {HooksState} from "./state/hooksState.js";
import {TodoState} from "./state/todoState.ts";
import {
  AgentCheckpointData,
  AgentStateSlice,
  AskHumanInterface,
  ChatOutputStream,
  ServiceRegistryInterface
} from "./types.js";
import {formatAgentId} from "./util/formatAgentId.ts";

export default class Agent
  implements AskHumanInterface,
    ChatOutputStream,
    ServiceRegistryInterface {

  readonly id: string = uuid();
  debugEnabled = false;
  requireServiceByType;
  getServiceByType;

  stateManager = new StateManager<AgentStateSlice>();
  initializeState = this.stateManager.initializeState.bind(this.stateManager);
  mutateState = this.stateManager.mutateState.bind(this.stateManager);
  getState = this.stateManager.getState.bind(this.stateManager);
  subscribeState = this.stateManager.subscribe.bind(this.stateManager);
  waitForState = this.stateManager.waitForState.bind(this.stateManager);
  timedWaitForState = this.stateManager.timedWaitForState.bind(this.stateManager);
  subscribeStateAsync = this.stateManager.subscribeAsync.bind(this.stateManager);

  private agentShutdownSignal = new AbortController();

  constructor(readonly app: TokenRingApp, readonly config: ParsedAgentConfig) {
    this.requireServiceByType = this.app.requireService;
    this.getServiceByType = this.app.getService;

    this.initializeState(AgentEventState, {});
    this.initializeState(AgentExecutionState, {});
    this.initializeState(CommandHistoryState, {});
    this.initializeState(HooksState, {});
    this.initializeState(CostTrackingState, {});
    this.initializeState(TodoState, {});

    this.emit({ type: "agent.created", timestamp: Date.now(), message: config.createMessage });

    for (const service of app.getServices()) {
      service.attach?.(this);
    }
  }

  get headless() {
    return this.config.headless;
  }

  get name() {
    return this.config.name;
  }

  static async createAgentFromCheckpoint(app: TokenRingApp, checkpoint: AgentCheckpointData, config: Partial<ParsedAgentConfig>) {
    const agent = new Agent(app, {
      ...checkpoint.config,
      createMessage: `Recovered agent of type: ${checkpoint.config.agentType} from checkpoint of agent ${formatAgentId(checkpoint.agentId)}`,
      ...config
    });

    agent.restoreState(checkpoint.state);

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
      state.emit({type: "abort", timestamp: Date.now(), reason});
      state.emit({type: "output.info", message: `Aborting current operation, ${reason}`, timestamp: Date.now()});
    });
  }

  reset(what: ResetWhat[]) {
    this.stateManager.forEach(item => item.reset?.(what))
    this.emit({ type: "reset", what, timestamp: Date.now() });
  }

  async askHuman<T extends HumanInterfaceType>(
    request: HumanInterfaceRequestFor<T>,
  ): Promise<HumanInterfaceResponseFor<T>> {
    if (this.config.headless) {
      throw new Error("Cannot ask human for feedback when agent is running in headless mode");
    }

    let requestId = uuid();
    this.mutateState(AgentEventState, (state) => {
      const event: z.infer<typeof HumanRequestSchema> = {type: "human.request", request: request, id: requestId, timestamp: Date.now()};
      state.emit(event);
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
    this.mutateState(AgentExecutionState, (state) => state.busyWith = message);
    try {
      return await awaitable;
    } finally {
      this.mutateState(AgentExecutionState, (state) => state.busyWith = null);
    }
  }

  setBusyWith(message: string | null) {
    this.mutateState(AgentExecutionState, (state) => {
      state.busyWith = message;
    })
  }

  setStatusLine(status: string | null) {
    this.mutateState(AgentExecutionState, (state) => {
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
  artifactOutput({name, encoding, mimeType, body}: Omit<z.input<typeof OutputArtifactSchema>, "type" | "timestamp">) {
    this.mutateState(AgentEventState, (state) => {
      state.events.push({ type: 'output.artifact', name, encoding, mimeType, body, timestamp: Date.now() });
    });
  }

  sendHumanResponse = (requestId: string, response: HumanInterfaceResponse) => {
    this.mutateState(AgentEventState, (state) => {
      state.events.push({type: "human.response", requestId, response, timestamp: Date.now()});
    });
  };

  getAbortSignal() {
    const state = this.getState(AgentExecutionState);
    return state.currentlyExecuting?.abortController.signal || this.agentShutdownSignal.signal;
  }

  async run(signal: AbortSignal): Promise<void> {
    signal.addEventListener('abort', () => this.agentShutdownSignal.abort());

    if (this.config.initialCommands.length > 0) {
      this.mutateState(AgentEventState, (state) => {
        for (const message of this.config.initialCommands) {
          state.events.push({type: "input.received", message: message.trim(), requestId: uuid(), timestamp: Date.now()});
        }
      })
    }

    const eventCursor = { position: 0 };

    for await (const state of this.subscribeStateAsync(AgentEventState, this.agentShutdownSignal.signal)) {
      for (const event of state.yieldEventsByCursor(eventCursor)) {
        if (event.type === "input.received") {
          this.mutateState(AgentExecutionState, (s) => {
            s.inputQueue.push(event);
          });
        } else if (event.type === "abort") {
          this.handleAbort();
        } else if (event.type === 'human.request') {
          this.mutateState(AgentExecutionState, (s) => {
            s.waitingOn.push(event);
          })
        } else if (event.type === "human.response") {
          this.mutateState(AgentExecutionState, (s) => {
            s.waitingOn = s.waitingOn.filter(item => item.id !== event.requestId);
          })
        }
      }
      
      this.startNextExecution();
    }

    this.emit({
      type: "agent.stopped",
      message: signal.aborted ? "Agent was aborted" : "Agent stopped normally",
      timestamp: Date.now()
    });


    for (const service of this.app.getServices()) {
      service.detach?.(this);
    }
  }

  private handleAbort(reason?: string): void {
    this.mutateState(AgentExecutionState, (state) => {
      const requestId = state.currentlyExecuting?.requestId;

      if (state.currentlyExecuting) {
        state.currentlyExecuting.abortController.abort(reason || "Abort requested");
      }

      this.mutateState(AgentEventState, (eventState) => {
        for (const item of state.inputQueue.filter(r => r.requestId !== requestId)) {
          eventState.emit({
            type: "input.handled",
            requestId: item.requestId,
            status: "cancelled",
            message: "Aborted",
            timestamp: Date.now(),
          });
        }
      });
    });
  }

  private startNextExecution(): void {
    const state = this.getState(AgentExecutionState);
    if (state.currentlyExecuting || state.inputQueue.length === 0) return;

    const item = state.inputQueue[0];

    const agentCommandService = this.requireServiceByType(AgentCommandService);
    const agentLifecycleService = this.getServiceByType(AgentLifecycleService);


    const itemAbortController = new AbortController();
    const handleAgentAbort = () => itemAbortController.abort();
    this.agentShutdownSignal.signal.addEventListener('abort', handleAgentAbort);

    this.mutateState(AgentExecutionState, (s) => {
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
        this.mutateState(AgentExecutionState, (s) => {
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
