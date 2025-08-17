import {Service} from "@token-ring/registry";
import formatLogMessages from "@token-ring/utility/formatLogMessage";
import {EventEmitter} from "eventemitter3";

/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 *
 */
export interface PersonaConfig {
  instructions: string;
  model: string;
  temperature?: number;
  top_p?: number;
}

export type ChatServiceOptions = {
  personas: Record<string, PersonaConfig>;
  persona: string;
};

export type JobInfo = {
  name: string;
  success?: boolean;
  error?: Error;
  queueLength?: number;
};

export type QueueState = {
  queueLength: number;
  isProcessing: boolean;
  currentJob: string | null;
};

export type Job = {
  name: string;
  // Execute a job with any arguments, returning a result or a promise of a result.
  // Using unknown for arguments and return type provides type safety while preserving flexibility.
  execute: (...args: unknown[]) => Promise<unknown> | unknown;
};

export interface ChatTool {
  version: string;
  description: string;
  // Functions for tool integration, using unknown for arguments and return types.
  getToolFunctions: (...args: unknown[]) => unknown;
  adjustChatRequest: (...args: unknown[]) => unknown;
  afterChatComplete: (...args: unknown[]) => unknown;
  afterTestingComplete: (...args: unknown[]) => unknown;
}

export type Body = {
  messages: Array<{
    role: string;
    content: string;
  }>;
  // Tools configuration map; using unknown for flexibility.
  tools?: Record<string, unknown> | Array<object>;
  model?: string;
};

export type Response = {
  id?: string;
  content?: string;
  toolCalls?: Array<object>;
  messages?: Array<object>;
  [key: string]: any;
};

export type ChatMessage = {
  id: number;
  sessionId: number;
  request: Body;
  cumulativeInputLength: number;
  response: Response;
  updatedAt: number;
};

export default class ChatService extends Service {
  name: string = "ChatService";

  // Declared class fields for TS type safety
  personas!: Record<string, PersonaConfig>;
  persona!: string;
  jobQueue!: Array<Job>;
  isProcessingQueue!: boolean;
  availableTools!: Record<string, ChatTool>;
  activeToolNames!: Set<string>;
  abortController!: AbortController | null;
  loggers!: Set<object>;
  description: string = "Manages chat interactions with AI chatModels";
  _receivers: Set<any> = new Set();
  _events: EventEmitter = new EventEmitter();
  /** @type {function(string, Function): EventEmitter} */
  on: (event: string, handler: Function) => EventEmitter = this._events.on.bind(this._events) as any;
  /** @type {function(string, Function): EventEmitter} */
  off: (event: string, handler: Function) => EventEmitter = this._events.off.bind(this._events) as any;

  constructor(options: ChatServiceOptions) {
    super();

    const {personas = {}, persona} = options;
    this.personas = personas;
    this.persona = persona;

    /* internal state ------------------------------------------------------ */
    this.jobQueue = [];
    this.isProcessingQueue = false;
    this.availableTools = {};
    this.activeToolNames = new Set<string>();
    this.abortController = new AbortController();
    this.loggers = new Set<object>();
  }

  /**
   * Emit an event to receivers and event listeners
   * @param {string} eventName - Name of the event to emit
   * @param {any} arg - Argument to pass to event handlers
   * @returns {boolean} - True if the event had listeners, false otherwise
   */
  emit(eventName: string, arg: any): boolean {
    // dispatch to receivers
    for (const r of this._receivers) {
      // @ts-ignore dynamic dispatch
      r[eventName]?.(arg);
    }
    // standard EventEmitter handling
    return this._events.emit(eventName as any, arg);
  }

  /* --------------------------------------------------------------------- */
  /* job queue                                                              */

  /* --------------------------------------------------------------------- */

  /**
   * Push a job onto the queue.
   *
   * @param {string} jobName - Name of the job
   * @param {Function} jobFunction - Async function to execute
   * @param {Array<any>} [jobArgs=[]] - Arguments to pass to the job function
   * @returns {Promise<any>} - Promise that resolves with the job result
   */
  submitJob(jobName: string, jobFunction: Function, jobArgs: Array<any> = []): Promise<any> {
    return new Promise((resolve, reject) => {
      const job: Job = {
        name: jobName,
        execute: async () => {
          try {
            this.emit("jobStarted", {name: jobName});

            const result = await (jobFunction)(...jobArgs);

            this.emit("jobCompleted", {name: jobName, success: true});
            resolve(result);
          } catch (error) {
            this.emit("jobFailed", {name: jobName, error});
            reject(error);
          }
        },
      };

      this.jobQueue.push(job);
      this.emit("jobQueued", {
        name: jobName,
        queueLength: this.jobQueue.length,
      });
    });
  }

  /**
   * Subscribe an object whose keys are event names and values are callbacks.
   * Returns an unsubscribe function.
   *
   * @param {Object<string, Function>} receiver - Object with event handler methods
   * @returns {() => void} - Unsubscribe function
   */
  subscribe(receiver: object): () => void {
    this._receivers.add(receiver);
    return () => this._receivers.delete(receiver);
  }

  /**
   * Convenience wrapper – identical to `on`, but returns an unsubscribe fn.
   * @param {string} eventName - Name of the event to subscribe to
   * @param {Function} handler - Event handler function
   * @returns {Function} - Unsubscribe function
   */
  subscribeToEvents(eventName: string, handler: Function): () => void {
    this.on(eventName, handler);
    return () => this.off(eventName, handler);
  }

  /**
   * Get the current state of the job queue
   * @returns {QueueState} - Object with queue state information
   */
  getQueueState(): QueueState {
    return {
      queueLength: this.jobQueue.length,
      isProcessing: this.isProcessingQueue,
      currentJob: this.jobQueue[0]?.name ?? null,
    };
  }

  /* --------------------------------------------------------------------- */
  /* model / instructions / abort controller                                */

  /* --------------------------------------------------------------------- */

  /**
   * Get the current instructions
   * @returns {string|undefined} - Current instructions
   */
  getInstructions(): string | undefined {
    return this.persona ? this.personas[this.persona]?.instructions : undefined;
  }

  /**
   * Set instructions for the current persona or global instructions
   * @param {string} instructions - Instructions to set
   * @returns {void}
   */
  setInstructions(instructions: string): void {
    if (this.persona) {
      this.personas[this.persona] = {
        ...this.personas[this.persona],
        instructions,
      };
    }
  }

  /**
   * Get the current model
   * @returns {string|undefined} - Current model name
   */
  getModel(): string {
    return this.personas[this.persona]?.model;
  }

  /**
   * Set model for the current persona or global model
   * @param {string} model - Model to set
   * @returns {void}
   */
  setModel(model: string): void {
    if (this.persona) {
      this.personas[this.persona] = {
        ...this.personas[this.persona],
        model,
      };
    }
  }

  /**
   * Get all personas
   * @returns {Object<string, PersonaConfig>} - All personas
   */
  getPersonas(): Record<string, PersonaConfig> {
    return this.personas;
  }

  /**
   * Get configuration for a specific persona
   * @param {string} name - Name of the persona
   * @returns {PersonaConfig|undefined} - Configuration for the persona
   */
  getPersonaConfig(name: string): PersonaConfig | undefined {
    return this.personas[name];
  }

  /**
   * Get current persona
   * @returns {string|null} - Current persona name
   */
  getPersona(): string {
    return this.persona;
  }

  /**
   * Set current persona
   * @param {string|null} persona - Persona to set
   * @throws {Error} If persona doesn't exist
   * @returns {void}
   */
  setPersona(persona: string): void {
    if (persona && !this.personas[persona]) {
      throw new Error(`Persona "${persona}" does not exist`);
    }
    this.persona = persona;
  }

  /**
   * Get the abort signal
   * @returns {AbortSignal} - Current abort signal
   */
  getAbortSignal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }

  /**
   * Reset the abort controller
   * @returns {void}
   */
  resetAbortController(): void {
    this.abortController = new AbortController();
  }

  /**
   * Clear the abort controller
   * @returns {void}
   */
  clearAbortController(): void {
    this.abortController = null;
  }

  /**
   * Get the abort controller
   * @returns {AbortController|null} - Current abort controller
   */
  getAbortController(): AbortController | null {
    return this.abortController;
  }

  /**
   * Log a system message
   * @param {...any} msgs - Messages to log
   * @returns {void}
   */
  systemLine(...msgs: any[]): void {
    // Format objects, arrays, and errors properly
    const formattedMsgs = formatLogMessages(msgs);
    this.emit("systemLine", formattedMsgs);
  }

  /**
   * Log an info message
   * @param {...any} msgs - Messages to log
   * @returns {void}
   */
  infoLine(...msgs: any[]): void {
    const formattedMsgs = formatLogMessages(msgs);
    this.emit("infoLine", formattedMsgs);
  }

  /**
   * Log a warning message
   * @param {...any} msgs - Messages to log
   * @returns {void}
   */
  warningLine(...msgs: any[]): void {
    const formattedMsgs = formatLogMessages(msgs);
    this.emit("warningLine", formattedMsgs);
  }

  /**
   * Log an error message
   * @param {...any} msgs - Messages to log
   * @returns {void}
   */
  errorLine(...msgs: any[]): void {
    const formattedMsgs = formatLogMessages(msgs);
    this.emit("errorLine", formattedMsgs);
  }

  /**
   * Write to standard output
   * @param {...any} msgs - Messages to write
   * @returns {void}
   */
  out(...msgs: any[]): void {
    this.emit("stdout", msgs.join(""));
  }

  /**
   * Write to standard error
   * @param {...any} msgs - Messages to write
   * @returns {void}
   */
  err(...msgs: any[]): void {
    this.emit("stderr", msgs.join(""));
  }
}
