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
import {HooksState} from "./state/hooksState.js";
import StateManager from "@tokenring-ai/app/StateManager";
import {
  AgentCheckpointData,
  AgentConfig, AgentConfigSchema,
  AgentStateSlice,
  AskHumanInterface,
  ChatOutputStream, ParsedAgentConfig,
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

  private abortController = new AbortController();

  constructor(app: TokenRingApp, {config, headless} : {config: AgentConfig, headless: boolean}) {
    this.app = app;
    this.config = AgentConfigSchema.parse(config);
    this.headless = headless
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
    this.initializeState(AgentEventState, {});
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
      const requestId = uuid();
      this.emit({ type: "input.received", message, requestId, timestamp: Date.now()});
      try {
        await agentCommandService.executeAgentCommand(this, message);
        this.emit({ type: "input.handled", requestId, status: "success", message: "Request completed successfully", timestamp: Date.now()});
      } catch (err) {
        if (this.abortController?.signal?.aborted) {
          this.emit({ type: "input.handled", requestId, status: "cancelled", message: "Request cancelled", timestamp: Date.now()});
        } else {
          this.emit({ type: "input.handled", requestId, status: "error", message: formatLogMessages(["Error: ", err as Error]), timestamp: Date.now()});
        }
        throw err;
      }
    }

    this.mutateState(AgentEventState, (state) => state.idle = true);
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
   * @returns A unique request ID for the input. This can be used to track the status of the request, e.g. to cancel it.
   */
  handleInput({message}: { message: string }): string {
    const requestId = uuid();

    this.app.trackPromise((async () => {
      try {
        message = message.trim();
        this.mutateState(AgentEventState, (state) => {
          state.idle = false;
          state.emit({type: "input.received", message, requestId, timestamp: Date.now()});
        });

        this.mutateState(CommandHistoryState, (state) => {
          state.commands.push(message);
        });

        await this.requireServiceByType(AgentCommandService).executeAgentCommand(this, message);

        this.mutateState(AgentEventState, (state) => {
          state.idle = true;
          state.emit({
            type: "input.handled",
            requestId, status: "success", message: "Request completed successfully",
            timestamp: Date.now()
          });

        });

        await this.getServiceByType(AgentLifecycleService)?.executeHooks(this, "afterAgentInputComplete", message);
      } catch (err) {
        if (this.abortController?.signal?.aborted) {
          this.mutateState(AgentEventState, (state) => {
            state.idle = true;
            state.emit({
              type: "input.handled",
              requestId, status: "cancelled", message: "Request cancelled",
              timestamp: Date.now()
            });
          });
        } else {
          this.mutateState(AgentEventState, (state) => {
            state.idle = true;
            state.emit({
              type: "input.handled",
              requestId, status: "error", message: formatLogMessages(["Error: ", err as Error]),
              timestamp: Date.now()
            });
          })
        }
      }
    })());

    return requestId;
  }


  chatOutput(content: string) {
    this.emit({ type: "output.chat", content, timestamp: Date.now() });
  }

  reasoningOutput(content: string) {
    this.emit({ type: "output.reasoning", content, timestamp: Date.now() });
  }

  systemMessage(message: string, level: "info" | "warning" | "error" = "info") {
    this.emit({ type: "output.system", message, level, timestamp: Date.now() });
  }

  getIdleDuration(): number {
    const events = this.getState(AgentEventState).events;


    const lastActivityTime = events[events.length - 1]?.timestamp;

    return Date.now() - lastActivityTime;
  }

  requestAbort(reason: string) {
    this.abortController.abort(reason);
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

  async busyWhile<T>(message: string, awaitable: Promise<T>): Promise<T> {
    this.mutateState(AgentEventState, (state) => state.busyWith = message);
    try {
      return await awaitable;
    } finally {
      this.mutateState(AgentEventState, (state) => state.busyWith = null);
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

  sendHumanResponse = (requestId: string, response: HumanInterfaceResponse) => {
    this.mutateState(AgentEventState, (state) => {
      state.waitingOn = null;
      state.events.push({type: "human.response", requestId, response, timestamp: Date.now()});
    });
  };

  getAbortSignal() {
    return this.abortController.signal;
  }

  private emit(event: AgentEventEnvelope): void {
    this.mutateState(AgentEventState, (state) => state.emit(event));
  }
}
