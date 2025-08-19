@token-ring/chat
=================

Chat primitives and services for Token Ring. This package provides the foundational building blocks for chat-oriented
tools and agents in the Token Ring ecosystem, including an event-driven ChatService, a HumanInterfaceService abstraction
for interactive UIs, and a HistoryStorage abstraction for command history.

Overview

- ChatService: Event-emitter–driven service to coordinate chat-related jobs, logging, personas, and abort signaling.
- HumanInterfaceService: Abstract UI contract to implement user prompts, selections, and file-tree selection in
  different environments (CLI, editor, web).
- HistoryStorage: Abstract history persistence for command prompts.
- chatCommands and runCommand: A small set of built-in chat commands and a helper to route commands through the service
  registry.

Installation
This package is part of the Token Ring monorepo and is typically consumed via workspaces.

- npm: npm install @token-ring/chat
- pnpm: pnpm add @token-ring/chat
- bun: bun add @token-ring/chat

Exports

- ChatService (default): Core chat manager and event emitter.
- chatCommands: Aggregated commands (clear, help, instructions, persona, resources, settings, tools).
- HumanInterfaceService (default): Abstract base class for implementing UI interactions.
- runCommand: Utility to execute chat commands via a Registry.

Quick Start

1) Create and register a ChatService
   import { ServiceRegistry } from "@token-ring/registry";
   import { ChatService } from "@token-ring/chat";

const registry = new ServiceRegistry();

const chat = new ChatService({
personas: {
default: {
instructions: "You are a helpful assistant.",
model: "gpt-4o-mini",
temperature: 0.3,
},
},
persona: "default",
});

registry.registerService(chat);

// Listen for events
chat.on("systemLine", (line) => console.log("[system]", line));
chat.on("infoLine", (line) => console.log("[info]", line));
chat.on("warningLine", (line) => console.warn("[warn]", line));
chat.on("errorLine", (line) => console.error("[error]", line));
chat.on("stdout", (text) => process.stdout.write(text));
chat.on("stderr", (text) => process.stderr.write(text));

// Emit some messages
chat.systemLine("ChatService initialized");
chat.infoLine("Ready to accept commands");

2) Submitting jobs to the queue
   // A job is any async function you want to run through the ChatService lifecycle
   await chat.submitJob("fetchSuggestions", async () => {
   chat.infoLine("Running job fetchSuggestions...");
   // ... perform work, call AI client, etc.
   return { suggestions: ["A", "B"] };
   });

// You can subscribe to queue-related events too
chat.on("jobQueued", (info) => console.log("queued", info));
chat.on("jobStarted", (info) => console.log("started", info));
chat.on("jobCompleted", (info) => console.log("done", info));
chat.on("jobFailed", (info) => console.error("failed", info));

3) Personas and model config
   // Read/Write persona and settings
   console.log(chat.getPersonas());
   console.log(chat.getPersona()); // "default"
   console.log(chat.getModel()); // model for current persona
   console.log(chat.getInstructions());

chat.setInstructions("Use concise answers.");
chat.setModel("gpt-4o-mini-2024-xx");
chat.setPersona("default");

4) Abort handling
   // Access an AbortSignal to pass into long-running operations
   const signal = chat.getAbortSignal();
   // Replace the controller if needed
   authenticatedOperation(signal).catch((err) => chat.errorLine(err));
   chat.resetAbortController();
   chat.clearAbortController();

5) Using built-in chat commands
   import { runCommand } from "@token-ring/chat";

// Commands are resolved through the registry's chatCommands registry
await runCommand("help", "", registry); // prints available commands
// Examples: /instructions, /persona, /settings, /resources, /tools, /clear

HumanInterfaceService
Extend this abstract class to implement user interactions (e.g., CLI select lists, multi-select, or free-form text
input) in your environment.

Key methods to implement:

- ask(question: string): Promise<string>
- askForSelection({ title, items }): Promise<string>
- askForMultipleSelections({ title, items, message? }): Promise<string[]>
- askForSingleTreeSelection(options): Promise<string>
- askForMultipleTreeSelection(options): Promise<string[]>

It also includes a ready-to-use askForFileSelection helper that builds a file/directory tree using
@token-ring/filesystem and presents it via the tree selection methods you implement.

HistoryStorage
Implement this abstract class to provide command history for chat prompts. Typical responsibilities:

- init(): setup underlying storage
- add(command): persist command (respecting limit and blacklist config)
- getPrevious()/getNext(): navigation through history
- getAll(): list all commands

Events
ChatService emits a number of events you can subscribe to using chat.on or chat.subscribeToEvents:

- jobQueued: { name, queueLength }
- jobStarted: { name }
- jobCompleted: { name, success: true }
- jobFailed: { name, error }
- systemLine | infoLine | warningLine | errorLine: formatted strings
- stdout | stderr: raw text writes

TypeScript Types

- PersonaConfig: { instructions, model, temperature?, top_p? }
- Body: { messages: [{ role, content }], tools?, model? }
- Response: { id?, content?, toolCalls?, messages?, ... }
- ChatMessage: { id, sessionId, request, cumulativeInputLength, response, updatedAt }

Related Packages

- @token-ring/registry: Service registry and chat command registry integration.
- @token-ring/utility: Utilities like formatLogMessage used for consistent log formatting.
- @token-ring/filesystem: Used by HumanInterfaceService.askForFileSelection to build file trees.

License
MIT
