import { Service } from "@token-ring/registry";
import EventEmitter from "eventemitter3";

import formatLogMessages from "@token-ring/utility/formatLogMessage";

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
	/** @type {string} */
	name = "ChatService";

	/** @type {string} */
	description = "Manages chat interactions with AI chatModels";

	/**
	 * @param {ChatServiceOptions} [options={}]
	 */
	constructor({ personas, persona } = {}) {
		super();

		/** @type {Object<string, PersonaConfig>} */
		this.personas = personas;

		/** @type {string|null} */
		this.persona = persona;

		/* internal state ------------------------------------------------------ */
		/** @type {Array<Job>} */
		this.jobQueue = [];

		/** @type {boolean} */
		this.isProcessingQueue = false;

		/** @type {Object<string, ChatTool>} */
		this.availableTools = {};

		/** @type {Set<string>} */
		this.activeToolNames = new Set();

		/** @type {AbortController|null} */
		this.abortController = new AbortController();

		/** @type {Set<Object>} */
		this.loggers = new Set();
	}

	/** @type {Set<Object>} */
	_receivers = new Set();

	/** @type {EventEmitter} */
	_events = new EventEmitter();

	/**
	 * Emit an event to receivers and event listeners
	 * @param {string} eventName - Name of the event to emit
	 * @param {any} arg - Argument to pass to event handlers
	 * @returns {boolean} - True if the event had listeners, false otherwise
	 */
	emit(eventName, arg) {
		// dispatch to receivers
		for (const r of this._receivers) {
			r[eventName]?.(arg);
		}
		// standard EventEmitter handling
		return this._events.emit(eventName, arg);
	}

	/** @type {function(string, Function): EventEmitter} */
	on = this._events.on.bind(this._events);

	/** @type {function(string, Function): EventEmitter} */
	off = this._events.off.bind(this._events);

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
	submitJob(jobName, jobFunction, jobArgs = []) {
		return new Promise((resolve, reject) => {
			/** @type {Job} */
			const job = {
				name: jobName,
				execute: async () => {
					try {
						this.emit("jobStarted", { name: jobName });

						const result = await jobFunction(...jobArgs);

						this.emit("jobCompleted", { name: jobName, success: true });
						resolve(result);
					} catch (error) {
						this.emit("jobFailed", { name: jobName, error });
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
	subscribe(receiver) {
		this._receivers.add(receiver);
		return () => this._receivers.delete(receiver);
	}

	/**
	 * Convenience wrapper – identical to `on`, but returns an unsubscribe fn.
	 * @param {string} eventName - Name of the event to subscribe to
	 * @param {Function} handler - Event handler function
	 * @returns {Function} - Unsubscribe function
	 */
	subscribeToEvents(eventName, handler) {
		this.on(eventName, handler);
		return () => this.off(eventName, handler);
	}

	/**
	 * Get the current state of the job queue
	 * @returns {QueueState} - Object with queue state information
	 */
	getQueueState() {
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
	getInstructions() {
		return this.personas[this.persona].instructions;
	}

	/**
	 * Set instructions for the current persona or global instructions
	 * @param {string} instructions - Instructions to set
	 * @returns {void}
	 */
	setInstructions(instructions) {
		this.personas[this.persona].instructions = instructions;
	}

	/**
	 * Get the current model
	 * @returns {string|undefined} - Current model name
	 */
	getModel() {
		return this.personas[this.persona].model;
	}

	/**
	 * Set model for the current persona or global model
	 * @param {string} model - Model to set
	 * @returns {void}
	 */
	setModel(model) {
		this.personas[this.persona].model = model;
	}

	/**
	 * Get all personas
	 * @returns {Object<string, PersonaConfig>} - All personas
	 */
	getPersonas() {
		return this.personas;
	}

	/**
	 * Get configuration for a specific persona
	 * @param {string} name - Name of the persona
	 * @returns {PersonaConfig|undefined} - Configuration for the persona
	 */
	getPersonaConfig(name) {
		return this.personas[name];
	}

	/**
	 * Get current persona
	 * @returns {string|null} - Current persona name
	 */
	getPersona() {
		return this.persona;
	}

	/**
	 * Set current persona
	 * @param {string|null} persona - Persona to set
	 * @throws {Error} If persona doesn't exist
	 * @returns {void}
	 */
	setPersona(persona) {
		if (persona && !this.personas[persona]) {
			throw new Error(`Persona "${persona}" does not exist`);
		}
		this.persona = persona;
	}

	/**
	 * Get the abort signal
	 * @returns {AbortSignal} - Current abort signal
	 */
	getAbortSignal() {
		return this.abortController?.signal;
	}

	/**
	 * Reset the abort controller
	 * @returns {void}
	 */
	resetAbortController() {
		this.abortController = new AbortController();
	}

	/**
	 * Clear the abort controller
	 * @returns {void}
	 */
	clearAbortController() {
		this.abortController = null;
	}

	/**
	 * Get the abort controller
	 * @returns {AbortController|null} - Current abort controller
	 */
	getAbortController() {
		return this.abortController;
	}

	/**
	 * Log a system message
	 * @param {...any} msgs - Messages to log
	 * @returns {void}
	 */
	systemLine(...msgs) {
		// Format objects, arrays, and errors properly
		const formattedMsgs = formatLogMessages(msgs);
		this.emit("systemLine", formattedMsgs);
	}

	/**
	 * Log an info message
	 * @param {...any} msgs - Messages to log
	 * @returns {void}
	 */
	infoLine(...msgs) {
		const formattedMsgs = formatLogMessages(msgs);
		this.emit("infoLine", formattedMsgs);
	}

	/**
	 * Log a warning message
	 * @param {...any} msgs - Messages to log
	 * @returns {void}
	 */
	warningLine(...msgs) {
		const formattedMsgs = formatLogMessages(msgs);
		this.emit("warningLine", formattedMsgs);
	}

	/**
	 * Log an error message
	 * @param {...any} msgs - Messages to log
	 * @returns {void}
	 */
	errorLine(...msgs) {
		const formattedMsgs = formatLogMessages(msgs);
		this.emit("errorLine", formattedMsgs);
	}

	/**
	 * Write to standard output
	 * @param {...any} msgs - Messages to write
	 * @returns {void}
	 */
	out(...msgs) {
		this.emit("stdout", msgs.join(""));
	}

	/**
	 * Write to standard error
	 * @param {...any} msgs - Messages to write
	 * @returns {void}
	 */
	err(...msgs) {
		this.emit("stderr", msgs.join(""));
	}
}
