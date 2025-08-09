/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 *
 * @typedef {Object} ChatServiceOptions
 * @property {string} [model] - The AI model to use
 * @property {string} [instructions] - System instructions for the AI
 * @property {Object<string, PersonaConfig>} [personas={}] - Map of available personas
 * @property {string} [persona=null] - Currently active persona
 *
 * @typedef {Object} PersonaConfig
 * @property {string} [instructions] - Persona-specific instructions
 * @property {string} [model] - Persona-specific model
 *
 * @typedef {Object} JobInfo
 * @property {string} name - Name of the job
 * @property {boolean} [success] - Whether the job completed successfully
 * @property {Error} [error] - Error that caused job failure
 * @property {number} [queueLength] - Current length of the job queue
 *
 * @typedef {Object} QueueState
 * @property {number} queueLength - Current length of the job queue
 * @property {boolean} isProcessing - Whether the queue is currently being processed
 * @property {string|null} currentJob - Name of the currently executing job, or null
 *
 * @typedef {Object} Job
 * @property {string} name - Name of the job
 * @property {Function} execute - Async function to execute the job
 *
 * @typedef {Object} ChatTool
 * @property {string} version - Version of the tool
 * @property {string} description - Description of what the tool does
 * @property {Function} getToolFunctions - Function that returns tool tools
 * @property {Function} adjustChatRequest - Function to modify chat requests
 * @property {Function} afterChatComplete - Function to run after chat completion
 * @property {Function} afterTestingComplete - Function to run after testing
 *
 * @typedef {Object} Body
 * @property {Array<Object>} messages - The messages in the request
 * @property {Array<Object>} [tools] - Tools available to the model
 * @property {string} [model] - The model used for this request
 *
 * @typedef {Object} Response
 * @property {string} id - Response identifier
 * @property {string} content - Response content
 * @property {Array<Object>} [toolCalls] - Tool calls made by the model
 *
 * @typedef {Object} ChatMessage
 * @property {number} id - The ID # of the record
 * @property {number} sessionId - The ID # of the session
 * @property {Body} request - The AI request
 * @property {number} cumulativeInputLength - The byte length of the input, including the output length from prior messages
 * @property {Response} response - The response from AI
 * @property {number} updatedAt - The update time in milliseconds since the epoch format
 */
export default class ChatService extends Service {
    /**
     * @param {ChatServiceOptions} [options={}]
     */
    constructor({ personas, persona }?: ChatServiceOptions);
    /** @type {Object<string, PersonaConfig>} */
    personas: {
        [x: string]: PersonaConfig;
    };
    /** @type {string|null} */
    persona: string | null;
    /** @type {Array<Job>} */
    jobQueue: Array<Job>;
    /** @type {boolean} */
    isProcessingQueue: boolean;
    /** @type {Object<string, ChatTool>} */
    availableTools: {
        [x: string]: ChatTool;
    };
    /** @type {Set<string>} */
    activeToolNames: Set<string>;
    /** @type {AbortController|null} */
    abortController: AbortController | null;
    /** @type {Set<Object>} */
    loggers: Set<any>;
    /** @type {Set<Object>} */
    _receivers: Set<any>;
    /** @type {EventEmitter} */
    _events: typeof EventEmitter;
    /**
     * Emit an event to receivers and event listeners
     * @param {string} eventName - Name of the event to emit
     * @param {any} arg - Argument to pass to event handlers
     * @returns {boolean} - True if the event had listeners, false otherwise
     */
    emit(eventName: string, arg: any): boolean;
    /** @type {function(string, Function): EventEmitter} */
    on: (arg0: string, arg1: Function) => typeof EventEmitter;
    /** @type {function(string, Function): EventEmitter} */
    off: (arg0: string, arg1: Function) => typeof EventEmitter;
    /**
     * Push a job onto the queue.
     *
     * @param {string} jobName - Name of the job
     * @param {Function} jobFunction - Async function to execute
     * @param {Array<any>} [jobArgs=[]] - Arguments to pass to the job function
     * @returns {Promise<any>} - Promise that resolves with the job result
     */
    submitJob(jobName: string, jobFunction: Function, jobArgs?: Array<any>): Promise<any>;
    /**
     * Subscribe an object whose keys are event names and values are callbacks.
     * Returns an unsubscribe function.
     *
     * @param {Object<string, Function>} receiver - Object with event handler methods
     * @returns {() => void} - Unsubscribe function
     */
    subscribe(receiver: {
        [x: string]: Function;
    }): () => void;
    /**
     * Convenience wrapper – identical to `on`, but returns an unsubscribe fn.
     * @param {string} eventName - Name of the event to subscribe to
     * @param {Function} handler - Event handler function
     * @returns {Function} - Unsubscribe function
     */
    subscribeToEvents(eventName: string, handler: Function): Function;
    /**
     * Get the current state of the job queue
     * @returns {QueueState} - Object with queue state information
     */
    getQueueState(): QueueState;
    /**
     * Get the current instructions
     * @returns {string|undefined} - Current instructions
     */
    getInstructions(): string | undefined;
    /**
     * Set instructions for the current persona or global instructions
     * @param {string} instructions - Instructions to set
     * @returns {void}
     */
    setInstructions(instructions: string): void;
    /**
     * Get the current model
     * @returns {string|undefined} - Current model name
     */
    getModel(): string | undefined;
    /**
     * Set model for the current persona or global model
     * @param {string} model - Model to set
     * @returns {void}
     */
    setModel(model: string): void;
    /**
     * Get all personas
     * @returns {Object<string, PersonaConfig>} - All personas
     */
    getPersonas(): {
        [x: string]: PersonaConfig;
    };
    /**
     * Get configuration for a specific persona
     * @param {string} name - Name of the persona
     * @returns {PersonaConfig|undefined} - Configuration for the persona
     */
    getPersonaConfig(name: string): PersonaConfig | undefined;
    /**
     * Get current persona
     * @returns {string|null} - Current persona name
     */
    getPersona(): string | null;
    /**
     * Set current persona
     * @param {string|null} persona - Persona to set
     * @throws {Error} If persona doesn't exist
     * @returns {void}
     */
    setPersona(persona: string | null): void;
    /**
     * Get the abort signal
     * @returns {AbortSignal} - Current abort signal
     */
    getAbortSignal(): AbortSignal;
    /**
     * Reset the abort controller
     * @returns {void}
     */
    resetAbortController(): void;
    /**
     * Clear the abort controller
     * @returns {void}
     */
    clearAbortController(): void;
    /**
     * Get the abort controller
     * @returns {AbortController|null} - Current abort controller
     */
    getAbortController(): AbortController | null;
    /**
     * Log a system message
     * @param {...any} msgs - Messages to log
     * @returns {void}
     */
    systemLine(...msgs: any[]): void;
    /**
     * Log an info message
     * @param {...any} msgs - Messages to log
     * @returns {void}
     */
    infoLine(...msgs: any[]): void;
    /**
     * Log a warning message
     * @param {...any} msgs - Messages to log
     * @returns {void}
     */
    warningLine(...msgs: any[]): void;
    /**
     * Log an error message
     * @param {...any} msgs - Messages to log
     * @returns {void}
     */
    errorLine(...msgs: any[]): void;
    /**
     * Write to standard output
     * @param {...any} msgs - Messages to write
     * @returns {void}
     */
    out(...msgs: any[]): void;
    /**
     * Write to standard error
     * @param {...any} msgs - Messages to write
     * @returns {void}
     */
    err(...msgs: any[]): void;
}
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type ChatServiceOptions = {
    /**
     * - The AI model to use
     */
    model?: string;
    /**
     * - System instructions for the AI
     */
    instructions?: string;
    /**
     * - Map of available personas
     */
    personas?: {
        [x: string]: PersonaConfig;
    };
    /**
     * - Currently active persona
     */
    persona?: string;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type PersonaConfig = {
    /**
     * - Persona-specific instructions
     */
    instructions?: string;
    /**
     * - Persona-specific model
     */
    model?: string;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type JobInfo = {
    /**
     * - Name of the job
     */
    name: string;
    /**
     * - Whether the job completed successfully
     */
    success?: boolean;
    /**
     * - Error that caused job failure
     */
    error?: Error;
    /**
     * - Current length of the job queue
     */
    queueLength?: number;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type QueueState = {
    /**
     * - Current length of the job queue
     */
    queueLength: number;
    /**
     * - Whether the queue is currently being processed
     */
    isProcessing: boolean;
    /**
     * - Name of the currently executing job, or null
     */
    currentJob: string | null;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type Job = {
    /**
     * - Name of the job
     */
    name: string;
    /**
     * - Async function to execute the job
     */
    execute: Function;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type ChatTool = {
    /**
     * - Version of the tool
     */
    version: string;
    /**
     * - Description of what the tool does
     */
    description: string;
    /**
     * - Function that returns tool tools
     */
    getToolFunctions: Function;
    /**
     * - Function to modify chat requests
     */
    adjustChatRequest: Function;
    /**
     * - Function to run after chat completion
     */
    afterChatComplete: Function;
    /**
     * - Function to run after testing
     */
    afterTestingComplete: Function;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type Body = {
    /**
     * - The messages in the request
     */
    messages: Array<any>;
    /**
     * - Tools available to the model
     */
    tools?: Array<any>;
    /**
     * - The model used for this request
     */
    model?: string;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type Response = {
    /**
     * - Response identifier
     */
    id: string;
    /**
     * - Response content
     */
    content: string;
    /**
     * - Tool calls made by the model
     */
    toolCalls?: Array<any>;
};
/**
 * ChatService
 * -----------
 * This service is an event-emitter: you can attach listeners with
 *   chatService.on('jobStarted', handler)
 * or remove them with
 *   chatService.off('jobStarted', handler)
 */
export type ChatMessage = {
    /**
     * - The ID # of the record
     */
    id: number;
    /**
     * - The ID # of the session
     */
    sessionId: number;
    /**
     * - The AI request
     */
    request: Body;
    /**
     * - The byte length of the input, including the output length from prior messages
     */
    cumulativeInputLength: number;
    /**
     * - The response from AI
     */
    response: Response;
    /**
     * - The update time in milliseconds since the epoch format
     */
    updatedAt: number;
};
import { Service } from "@token-ring/registry";
import EventEmitter from "eventemitter3";
