# @tokenring‑ai/agent

> **A modular, extensible framework for building AI‑driven agents, teams, and tooling.**  
> The package provides a core **Agent** implementation, a **Team** manager, services for persistence, history, human interaction, and a plug‑in system for tools, chat commands, hooks, and custom services.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
 - [Agent](#agent)
 - [AgentTeam](#agentteam)
 - [Services](#services)
 - [Tools](#tools)
 - [Checkpoints](#checkpoints)
 - [Human Interface](#human-interface)
 - [History Storage](#history-storage)
 - [Events](#events)
3. [Architecture Overview](#architecture-overview)
4. [API Reference](#api-reference)
5. [Installation](#installation)
6. [Quick Start](#quick-start)
7. [Usage Details](#usage-details)
 - [Built‑in Commands](#built‑in-commands)
 - [Custom Services / Tools / Human Interfaces](#custom-services--tools--human-interfaces)
8. [Extending the Package](#extending-the-package)
9. [Testing](#testing)
10. [Contributing](#contributing)
11. [License](#license)

---

## Introduction

`@tokenring-ai/agent` is the **core runtime** for the TokenRing ecosystem. It lets you:

* Define **agent configurations** (model, prompts, visual style, etc.).
* Spin up **multiple agents** that can cooperate via a shared **AgentTeam**.
* Persist and restore agent state through **checkpoints**.
* Hook into the chat lifecycle with **hooks** (pre‑/post‑completion, testing, etc.).
* Expose **tools** that agents can invoke as part of a conversation.
* Provide a **human interface** for interactive selections, confirmations, or free‑form input.
* Store command **history** and expose a **service registry** for custom extensions.

All of this is type‑safe, event‑driven, and designed for both CLI and programmatic use.

---

## Core Concepts

### Agent

*Implemented in `pkg/agent/Agent.ts`.*

* **Lifecycle** – `initialize()` attaches services, runs `initialCommands`, then becomes idle.
* **State slices** – Arbitrary state objects can be registered via `initializeState()` and accessed with `getState()` / `mutateState()`.
* **Tool & Hook selectors** – `tools` and `hooks` are `RegistryMultiSelector`s that enable/disable items per‑session.
* **Human interaction** – `askHuman(request)` emits a `human.request` event and returns a promise resolved when a response arrives.
* **Event stream** – `events(signal)` yields `AgentEventEnvelope`s (chat, system, state changes, human I/O, etc.).
* **Auto‑save** – After idle, human response, or reset, the agent automatically stores a checkpoint via `AgentCheckpointService` (if registered).

### AgentTeam

*Implemented in `pkg/agent/AgentTeam.ts`.*

* **Registries** – Holds collections of packages, services, chat commands, tools, hooks, and agent configs (`KeyedRegistry` / `TypedRegistry`).
* **Package loading** – `addPackages(packages)` registers everything a package exports (tools, commands, hooks, agents) and runs optional `start` hooks.
* **Agent creation** – `createAgent(type)` looks up the config, constructs an `Agent`, runs its `initialize()`, and tracks it in internal maps.
* **Service lookup** – `requireFirstServiceByType` / `getFirstServiceByType` expose services to agents.
* **Event bus** – `events` (via `eventemitter3`) lets the team broadcast system‑level messages (`serviceOutput`, `serviceError`).

### Services

All services implement the `TokenRingService` interface (`pkg/agent/types.ts`):

```ts
export interface TokenRingService {
  name: string;
  description: string;
  start?(team: AgentTeam): Promise<void>;
  stop?(team: AgentTeam): Promise<void>;
  attach?(agent: Agent): Promise<void>;
  detach?(agent: Agent): Promise<void>;
  getMemories?(agent: Agent): AsyncGenerator<MemoryItemMessage>;
  getAttentionItems?(agent: Agent): AsyncGenerator<AttentionItemMessage>;
}
```

Key built‑in services:

| Service | File | Purpose |
|---------|------|---------|
| **AgentCheckpointService** | `AgentCheckpointService.ts` | Persists agent state via a `AgentCheckpointProvider`. |
| **HistoryStorage** (abstract) | `HistoryStorage.ts` | Base class for CLI history providers (e.g., in‑memory, file‑based). |
| **HumanInterfaceProvider** | `HumanInterfaceProvider.ts` | Supplies UI primitives (`ask`, `openWebPage`, selections, confirmations). |

### Tools

*Defined in packages (`TokenRingPackage.tools`) and wrapped with a `packageName` prefix.*  
Tool definition (`TokenRingTool`):

```ts
export type TokenRingTool = {
  packageName: string;
} & TokenRingToolDefinition;
```

`TokenRingToolDefinition` includes:

* `name`, `description`
* `execute(input, agent)` – returns a string or object.
* `inputSchema` – a Zod schema for validation.
* Optional `start` / `stop` lifecycle hooks.

Built‑in tools (see `pkg/agent/tools/*.ts`):

* `agent/list` – lists registered agent types.
* `agent/run` – creates a temporary agent, sends a message, returns its response.

### Checkpoints

*Implemented via `AgentCheckpointProvider` (interface) and `AgentCheckpointService` (service).*

* **Store** – `saveAgentCheckpoint(name, agent)` returns a checkpoint ID.
* **Restore** – `restoreAgentCheckpoint(id, agent)` loads state and calls `agent.restoreCheckpoint()`.
* **List** – `listCheckpoints()` returns lightweight metadata (`AgentCheckpointListItem`).

Checkpoint data (`AgentCheckpointData`) captures:

* `agentId`, `createdAt`
* `state.agentState` (serialized slices)
* `toolsEnabled`, `hooksEnabled`

### Human Interface

`HumanInterfaceProvider` defines the contract for UI interactions. The `HumanInterfaceRequest` union (see `HumanInterfaceRequest.ts`) includes:

* `askForConfirmation`
* `openWebPage`
* `askForSelection`
* `ask`
* `askForMultipleSelections`
* `askForSingleTreeSelection`
* `askForMultipleTreeSelection`

Agents emit `human.request` events; a UI layer (CLI, VS Code extension, web UI) listens, presents the request, and calls `agent.sendHumanResponse(sequence, response)`.

### History Storage

`HistoryStorage` (abstract) defines:

* `init()`, `add(command)`, `getPrevious()`, `getNext()`, `getAll()`
* Configurable `limit` and `blacklist`.

Concrete implementations can be provided by the host application and registered as a service.

### Events

All runtime activity is expressed via **typed events** (`AgentEvents` in `AgentEvents.ts`). Event envelope types (`AgentEventEnvelope`) are emitted through the agent’s internal `emit()` method and can be consumed via `agent.events(abortSignal)`.

Key event categories:

| Category | Example Types |
|----------|---------------|
| Output   | `output.chat`, `output.reasoning`, `output.system` |
| State    | `state.busy`, `state.notBusy`, `state.idle`, `state.aborted` |
| Input    | `input.received` |
| Human    | `human.request`, `human.response` |
| Control  | `reset` |

---

## Architecture Overview

```
+-------------------+          +-------------------+
|   AgentTeam       |<-------->|   TokenRingPackage|
| (registries, svc) |          | (tools, cmds,…)   |
+-------------------+          +-------------------+
        |                               |
        | creates                        |
        v                               v
+-------------------+          +-------------------+
|      Agent        |<------->|   Services (e.g.  |
| (state, tools,   |  events  |   Checkpoint,    |
|  hooks, UI)      |          |   History, …)    |
+-------------------+          +-------------------+
        |
        | emits AgentEventEnvelope
        v
+-------------------+
|   Human UI Layer  |
| (CLI / VSCode)   |
+-------------------+
```

* **AgentTeam** is the central registry and lifecycle manager.
* **Agent** is a lightweight runtime that delegates to the team for services, tools, and hooks.
* **Services** are pluggable, can attach to agents, and expose additional capabilities (persistence, history, etc.).
* **Tools** are invoked by agents via the `tools` selector; they can be enabled/disabled per session.
* **Human UI** consumes `human.request` events and replies via `sendHumanResponse`.

All components are fully typed, making it straightforward to write custom extensions.

---

## API Reference

### Exported from `pkg/agent/index.ts`

| Export | Type | Description |
|--------|------|-------------|
| `packageInfo` | `TokenRingPackage` | Metadata for the `@tokenring-ai/agent` package (name, version, description, exported chat commands & tools). |
| `Agent` | `class` | Core agent implementation (see **Agent** section). |
| `AgentTeam` | `class` | Team/registry manager (see **AgentTeam**). |
| `AgentStateStorage` | `class` (actually `AgentCheckpointService`) | Service that persists checkpoints. |
| `TokenRingPackage` | `type` | Shape of a package (name, version, description, optional `start`, `tools`, `chatCommands`, `hooks`, `agents`). |

### Key Types (re‑exported)

| Type | Source | Meaning |
|------|--------|---------|
| `AgentConfig` | `Agent.ts` | Configuration required to instantiate an agent (name, description, visual, AI model config, initial commands, persistence options). |
| `AgentEvents` / `AgentEventEnvelope` | `AgentEvents.ts` | Typed event definitions emitted by agents. |
| `TokenRingService` | `types.ts` | Base interface for all services. |
| `TokenRingTool` / `TokenRingToolDefinition` | `types.ts` | Definition of a tool that agents can call. |
| `TokenRingChatCommand` | `types.ts` | Definition of a slash‑command (`/reset`, `/tools`, …). |
| `HookConfig` | `types.ts` | Hook registration (name, package, callbacks). |
| `HistoryConfig` | `HistoryStorage.ts` | Configuration for history storage. |
| `HumanInterfaceRequest` | `HumanInterfaceRequest.ts` | Union of all possible UI requests. |

### Important Methods

| Class / Service | Method | Purpose |
|-----------------|--------|---------|
| `AgentTeam` | `addPackages(packages)` | Register a list of `TokenRingPackage`s. |
| `AgentTeam` | `createAgent(type)` | Instantiate an agent of a registered type. |
| `AgentTeam` | `deleteAgent(agent)` | Gracefully shut down and remove an agent. |
| `Agent` | `initialize()` | Attach services, run initial commands, set idle. |
| `Agent` | `handleInput({message})` | Parse slash commands or treat as chat. |
| `Agent` | `askHuman(request)` | Emit a human request and await response. |
| `Agent` | `events(abortSignal)` | Async generator yielding all emitted events. |
| `AgentCheckpointService` | `saveAgentCheckpoint(name, agent)` | Persist current state. |
| `AgentCheckpointService` | `restoreAgentCheckpoint(id, agent)` | Load a checkpoint into an agent. |
| `AgentCheckpointService` | `listCheckpoints()` | Retrieve checkpoint metadata. |
| `HistoryStorage` (subclass) | `add(command)` | Store a command in history. |
| `HumanInterfaceProvider` | Various `ask*` methods | UI primitives that a concrete provider must implement. |

---

## Installation

```bash
# Using npm
npm install @tokenring-ai/agent

# Using yarn
yarn add @tokenring-ai/agent
```

The package has peer dependencies on:

* `@tokenring-ai/utility`
* `@tokenring-ai/ai-client`
* `eventemitter3`
* `zod`
* `uuid`

Make sure they are installed (most are pulled in automatically).

---

## Quick Start

Below is a minimal example that creates a team, registers a simple package, spins up an agent, and runs a command.

```ts
import { AgentTeam, Agent, packageInfo } from '@tokenring-ai/agent';
import { TokenRingPackage } from '@tokenring-ai/agent/types';

// 1️⃣ Create the team
const team = new AgentTeam({
  persistentStorage: {
    // Simple in‑memory storage for demo purposes
    async storeState(agent) { return 'dummy-id'; },
    async loadState(id, team) { throw new Error('not implemented'); },
  },
});

// 2️⃣ Register the built‑in package (exposes /tools, /reset, etc.)
await team.addPackages([packageInfo]);

// 3️⃣ Register a custom agent type (example config)
team.addAgentConfig('demo', {
  name: 'Demo Agent',
  description: 'A tiny demo agent',
  visual: { color: 'green' },
  ai: { model: 'gpt-4o-mini', temperature: 0.7 },
  initialCommands: [], // optional startup commands
});

// 4️⃣ Create an agent instance
const agent: Agent = await team.createAgent('demo');

// 5️⃣ Send a chat message (treated as a normal chat)
await agent.handleInput({ message: 'Hello, world!' });

// 6️⃣ Listen for output (optional)
for await (const ev of agent.events(agent.getAbortSignal())) {
  if (ev.type === 'output.chat') {
    console.log('Agent says:', ev.data.content);
  }
}
```

### Using Built‑in Commands

```ts
// Enable a tool
await agent.handleInput({ message: '/tools enable agent/list' });

// List available agents
await agent.handleInput({ message: '/agents' }); // (if a /agents command exists)

// Create a checkpoint
await agent.handleInput({ message: '/checkpoint create "Before major change"' });
```

---

## Usage Details

### Built‑in Commands

| Command | Syntax | Description |
|---------|--------|-------------|
| **/reset** | `/reset [chat|memory|settings|all]…` | Clears selected parts of the agent’s state. |
| **/tools** | `/tools [enable|disable|set] <tool…>` | List, enable, disable, or set the active tool set. Without arguments opens an interactive tree selection. |
| **/checkpoint** | `/checkpoint create|restore|list` | Create a checkpoint, restore by ID, or browse checkpoints via an interactive tree. |
| **/history** | `/history` | Browse checkpoint history (same UI as `/checkpoint list`). |
| **/settings** | `/settings` | Shows currently active services and tools. |
| **/hooks** | `/hooks [list|enable|disable] <hook>` | Manage hook registration and activation. |
| **/agents** (provided by packages) | `/agents` | List registered agent types (via `agent/list` tool). |
| **/run** (tool) | `/run agentType "message"` | Creates a temporary agent, sends a message, returns its response. |

All commands are defined under `pkg/agent/commands/*.ts` and exported via `chatCommands.ts`.

### Custom Services / Tools / Human Interfaces

#### Adding a Service

```ts
import { TokenRingService } from '@tokenring-ai/agent/types';

class MyLoggingService implements TokenRingService {
  name = 'MyLoggingService';
  description = 'Logs every chat message to an external system';

  async attach(agent: Agent) {
    // Listen to chat output events
    agent.events(agent.getAbortSignal()).then(async function* (ev) {
      for await (const e of ev) {
        if (e.type === 'output.chat') {
          await externalLog(e.data.content);
        }
      }
    });
  }
}

// Register
team.services.register(new MyLoggingService());
```

#### Adding a Tool

```ts
import { z } from 'zod';
import { TokenRingToolDefinition } from '@tokenring-ai/agent/types';
import { Agent } from '@tokenring-ai/agent';

export const myTool: TokenRingToolDefinition = {
  name: 'my/tool',
  description: 'Returns the current date/time',
  inputSchema: z.object({}),
  async execute(_, agent) {
    const now = new Date().toISOString();
    agent.chatOutput(`Current time: ${now}`);
    return now;
  },
};

// In a package definition:
export const myPackage: TokenRingPackage = {
  name: 'my-package',
  version: '0.1.0',
  description: 'Demo package',
  tools: { 'my/tool': myTool },
};
await team.addPackages([myPackage]);
```

#### Implementing a Human Interface Provider

Create a class that implements the methods in `HumanInterfaceProvider` (e.g., a VS Code extension, a web UI, or a simple CLI prompt). Register it as a service:

```ts
class CliHumanProvider implements HumanInterfaceProvider {
  name = 'CliHumanProvider';
  description = 'CLI prompts using stdin/stdout';

  async askForConfirmation({ message, default: def }) {
    // simple node prompt...
  }
  async openWebPage(url) { /* maybe spawn a browser */ }
  async askForSelection({ title, items }) { /* prompt */ }
  async ask(question) { /* multiline input */ }
  async askForMultipleSelections({ title, items }) { /* prompt */ }
  async askForSingleTreeSelection({ message, tree }) { /* tree UI */ }
  async askForMultipleTreeSelection({ message, tree }) { /* tree UI */ }
}

// Register
team.services.register(new CliHumanProvider());
```

Now any `agent.askHuman(request)` will be satisfied by this provider.

---

## Extending the Package

### Writing New Services

1. Implement `TokenRingService`.
2. Optionally provide `attach`/`detach` to hook into agents.
3. Register with `team.services.register(new MyService())`.

### Writing New Tools

1. Define a `TokenRingToolDefinition` (name, description, Zod schema, `execute`).
2. Add to a `TokenRingPackage.tools` map.
3. Register the package via `team.addPackages([myPackage])`.

### Writing New Hooks

Hooks are simple objects with optional callbacks:

```ts
const myHook: HookConfig = {
  name: 'logBefore',
  packageName: 'my-package',
  description: 'Logs input before chat completion',
  beforeChatCompletion: async (agent, ...args) => {
    console.log('About to call LLM with', args);
  },
};
```

Add to `TokenRingPackage.hooks` and register the package.

### Custom Human Interface Providers

Implement the methods in `HumanInterfaceProvider`. Register as a service. The UI layer must listen for `human.request` events and call `agent.sendHumanResponse(sequence, response)`.

---

## Testing

The repository includes a Vitest configuration (`vitest.config.ts`). To run the test suite:

```bash
npm run test   # or `npx vitest`
```

Add new test files under `test/**/*.test.ts`. The test environment is Node, and globals (`describe`, `it`, `expect`) are available.

---

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/my‑feature`).
3. Write code and accompanying tests.
4. Run `npm run lint && npm run test` to ensure quality.
5. Submit a Pull Request with a clear description of the change.

Please follow the existing code style (TypeScript, 2‑space indentation, explicit types) and update the README if you add public APIs.

---

## License

`@tokenring-ai/agent` is released under the **MIT License**. See the `LICENSE` file in the repository for full terms.
