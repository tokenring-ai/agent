# Agent Package Documentation

## Overview

The `@tokenring-ai/agent` package is a core component of the TokenRing AI system, designed to create, manage, and orchestrate AI agents. These agents can process commands, utilize tools, execute hooks, maintain state, and interact with users or other services through events and chat interfaces. The package supports building collaborative AI teams where agents can share resources like tools, commands, and storage. It emphasizes modularity via registries for extensibility, persistence through checkpoints, and asynchronous event handling for real-time interactions. This package is particularly suited for AI-driven applications involving natural language processing, task automation, and multi-agent workflows.

## Installation/Setup

To use this package in a Node.js/TypeScript project:

1. Ensure you have Node.js (v18+) and npm/yarn installed.
2. Install the package and its peer dependencies:
   ```
   npm install @tokenring-ai/agent @tokenring-ai/utility @tokenring-ai/ai-client
   ```
   (Note: `@tokenring-ai/ai-client` is required for AI configurations.)
3. For development, clone the repository and build:
   ```
   cd pkg/agent
   npm install
   npm run build  # Compiles TypeScript to JavaScript
   ```
4. Import and use as an ES module (package type is "module").

Environment variables or configs for AI services (e.g., API keys) should be set per the `@tokenring-ai/ai-client` documentation.

## Package Structure

The package is organized as a TypeScript library with the following key directories and files:

- **Root files**:
  - `package.json`: Defines the package metadata, dependencies, and exports.
  - `index.ts`: Main entry point exporting core classes and package info.
  - `types.ts`: Type definitions for tools, commands, hooks, services, etc.
  - `Agent.ts`: Core `Agent` class implementation.
  - `AgentTeam.ts`: Manages teams of agents and registries.
  - `ContextStorage.ts`: Handles context items for agent memory.
  - `HistoryStorage.ts`: Abstract base for CLI history management.

- **Commands** (`commands/`):
  - Files like `history.ts`, `checkpoint.ts`, `reset.ts`, `hook.ts`, `tool.ts`, `settings.ts`: Implement chat commands for agent control (e.g., saving checkpoints, resetting state).

- **Tools** (`tools/`):
  - `runAgent.ts`: Tool to execute an agent.
  - `listAgents.ts`: Tool to list available agents.
  - `tools.ts`: Exports tools for the package.

- **Other**:
  - `AgentCheckpointService.ts`, `AgentCheckpointProvider.ts`: Handle agent state persistence.
  - `AgentEvents.ts`: Defines event types for agent lifecycle.
  - `chatCommands.ts`: Base chat command implementations.
  - Config files: `tsconfig.json`, `vitest.config.ts` for building and testing.
  - `LICENSE`: MIT license.

Directories like `commands/` and `tools/` contain modular extensions that can be registered dynamically.

## Core Components

### AgentTeam

`AgentTeam` is the central orchestrator for managing multiple agents, packages, and shared resources. It uses registries to handle tools, commands, hooks, and services.

- **Key Methods**:
  - `addPackages(packages: TokenRingPackage[])`: Registers tools, commands, hooks, and agents from packages. Starts package-specific initialization.
  - `createAgent(type: string): Promise<Agent>`: Creates and initializes a new agent instance by type.
  - `getAgents(): Agent[]`: Retrieves all active agents.
  - `deleteAgent(agent: Agent): Promise<void>`: Shuts down and removes an agent.

- **Interactions**: Acts as a service itself (`implements TokenRingService`), emitting events for outputs/errors. Registries (e.g., `tools`, `chatCommands`) are shared across agents.

### Agent

The `Agent` class represents an individual AI agent. It maintains state, processes inputs via commands, emits events, and integrates with tools/hooks/services.

- **Description**: Configured via `AgentConfig`, an agent can be persistent, handle initial commands, and interact with AI services. It supports checkpointing for state restoration.

- **Key Methods**:
  - Constructor: `new Agent(agentTeam: AgentTeam, options: AgentConfig)`
    - Initializes tools, hooks, and services from the team.
  - `initialize(): Promise<void>`: Attaches services and runs initial commands.
  - `handleInput({message: string}): Promise<void>`: Processes user input, dispatching to chat commands (e.g., `/help`, `/reset`).
  - `generateCheckpoint(): AgentCheckpointData`: Serializes state, tools, and hooks for persistence.
  - `restoreCheckpoint(data: AgentCheckpointData): void`: Deserializes and restores state.
  - `events(signal: AbortSignal): AsyncGenerator<AgentEventEnvelope>`: Yields real-time events (e.g., 'output.chat', 'state.busy').
  - `askHuman(request: HumanInterfaceRequest): Promise<any>`: Requests human input, resolving via `sendHumanResponse`.
  - `reset(what: ResetWhat[])`: Resets specific state slices (e.g., memory, tools).

- **State Management**:
  - `initializeState(ClassType, props)`: Adds a state slice (implements `AgentStateSlice` with `serialize`/`deserialize`).
  - `getState<T>(ClassType): T`: Retrieves a state slice.
  - State slices handle serialization for checkpoints.

- **Interactions**: Emits events for outputs (chat, reasoning, system), state changes (busy/idle), and human interactions. Uses team's registries for tools/hooks. Auto-saves checkpoints on idle/reset/response events.

### ContextStorage

Manages ordered context items (e.g., chat messages) for agent memory.

- **Key Methods**:
  - `addItem(item: ContextItem)`: Adds a context item with ID and optional delete callback.
  - `getItemsInOrder(): ContextItem[]`: Returns sorted items by creation time.
  - `toJSON()` / `fromJSON(items)`: For persistence.

- **Interactions**: Can be integrated into agent state for maintaining conversation history.

### HistoryStorage

Abstract class for storing CLI command history, useful for interactive agent sessions.

- **Key Methods** (abstract):
  - `init()`: Setup storage.
  - `add(command: string)`: Append to history.
  - `getPrevious()` / `getNext(): string | null`: Navigate history.
  - `getAll(): string[]`: List all entries.

- **Configuration**: `HistoryConfig` with `limit` (default 100) and `blacklist`.

- **Interactions**: Implements `TokenRingService` for team integration.

### Other Components

- **Tools and Hooks**: Registered via `TokenRingTool` and `HookConfig`. Tools have `execute` with Zod schemas; hooks run before/after chat completions.
- **Chat Commands**: `TokenRingChatCommand` with `execute` and `help` methods for handling inputs like `/checkpoint` or `/tool`.
- **Services**: `TokenRingService` interface for attachable components (e.g., memory providers via `getMemories()` generator).

Components interact through the `AgentTeam`'s registries and the agent's event system, enabling modular extensions.

## Usage Examples

### 1. Creating an Agent Team and Adding Packages

```typescript
import { AgentTeam, TokenRingPackage } from '@tokenring-ai/agent';
import { packageInfo as utilityPackage } from '@tokenring-ai/utility'; // Example package

const team = new AgentTeam({ persistentStorage: /* implement AgentPersistentStorage */ });
await team.addPackages([utilityPackage /*, other packages */]);

const agent = await team.createAgent('myAgentType'); // Assumes config registered
```

### 2. Handling Agent Input and Events

```typescript
// Listen to events
const eventIterator = agent.events(new AbortController().signal);
for await (const event of eventIterator) {
  if (event.type === 'output.chat') {
    console.log('Agent says:', event.data.content);
  } else if (event.type === 'state.idle') {
    console.log('Agent is ready.');
  }
}

// Process user input
await agent.handleInput({ message: '/help' }); // Runs help command
await agent.handleInput({ message: 'Hello, agent!' }); // Falls back to chat
```

### 3. Checkpointing and Reset

```typescript
// Generate and save checkpoint (via service)
const checkpoint = agent.generateCheckpoint();
await storage.saveAgentCheckpoint('Manual save', agent);

// Restore
await agent.restoreCheckpoint(checkpoint);

// Reset specific state
agent.reset(['memory', 'tools']);
```

## Configuration Options

- **AgentConfig**:
  - `name: string`: Agent identifier.
  - `description: string`: Purpose.
  - `visual: { color: ColorName }`: UI color (e.g., 'blue').
  - `ai: AIConfig`: From `@tokenring-ai/ai-client` for LLM integration.
  - `initialCommands: string[]`: Startup messages/commands.
  - `persistent?: boolean`: Enable checkpointing.
  - `storagePath?: string`: Custom storage location.

- **Team Config** (`AgentTeamConfig`): `persistentStorage: AgentPersistentStorage` for state loading/saving.

- **Hooks/Tools/Commands**: Configured via `TokenRingPackage` records, registered dynamically.

- Environment: No specific vars; AI configs handle API keys.

## API Reference

- **AgentTeam**:
  - `addPackages(packages: TokenRingPackage[]): Promise<void>`
  - `createAgent(type: string): Promise<Agent>`
  - `getAgents(): Agent[]`

- **Agent**:
  - `new Agent(team: AgentTeam, config: AgentConfig)`
  - `handleInput(input: {message: string}): Promise<void>`
  - `events(signal: AbortSignal): AsyncGenerator<AgentEventEnvelope>`
  - `generateCheckpoint(): AgentCheckpointData`
  - `askHuman(request: HumanInterfaceRequest): Promise<any>`

- **Types**:
  - `TokenRingTool`: `{ name, description, execute, inputSchema }`
  - `TokenRingChatCommand`: `{ description, execute(input: string, agent: Agent) }`
  - `HookConfig`: `{ name, beforeChatCompletion?, afterChatCompletion? }`
  - `AgentStateSlice`: `{ reset(what: ResetWhat[]), serialize(): object, deserialize(data: object) }`

See `types.ts` for full signatures.

## Dependencies

- `@tokenring-ai/utility` (^0.1.0): Registries, logging utilities.
- `eventemitter3` (^5.0.1): Event handling.
- `glob-gitignore` (^1.0.15): File globbing with .gitignore support.
- `uuid` (^11.1.0): ID generation.
- Dev: `typescript` (^5.9.2).

Peer: `@tokenring-ai/ai-client` for AI integration (not listed, but imported).

## Contributing/Notes

- **Building/Testing**: Run `npm run build` for compilation. Use Vitest for tests (`npm test`).
- **Extending**: Implement `TokenRingPackage` to add custom agents/tools/commands.
- **Limitations**: Early version (0.1.0); checkpointing relies on external storage services. Human input requires manual resolution via `sendHumanResponse`. No built-in LLM; configure via AI config.
- Contributions: Fork, add features/tests, submit PRs. Follow TypeScript best practices and MIT license.