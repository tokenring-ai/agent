# Agent Package Documentation

## Overview

The `@tokenring-ai/agent` package is the core orchestration system for TokenRing AI, enabling creation and management of AI agents that can execute commands, use tools, run hooks, maintain state, and communicate through asynchronous events. Agents operate within teams (AgentTeam) that share registries of tools, commands, hooks, and services. The package supports interactive and background agent types, sub-agent creation, state persistence via checkpoints, and human interaction requests. Built for modularity and extensibility, it's ideal for AI-driven task automation, multi-agent workflows, and collaborative AI systems.

## Installation

```bash
npm install @tokenring-ai/agent @tokenring-ai/utility
```

This package is an ES module and requires Node.js 18+. Dependencies:
- `@tokenring-ai/utility` (^0.1.0) - Registries and utilities
- `eventemitter3` (^5.0.1) - Event handling
- `glob-gitignore` (^1.0.15) - File pattern matching
- `uuid` (^13.0.0) - ID generation

## Package Structure

```
pkg/agent/
├── Agent.ts                    # Core Agent class
├── AgentTeam.ts                # Team orchestrator and registries
├── AgentContextService.ts      # Context provider for agents
├── AgentEvents.ts              # Event type definitions
├── HumanInterfaceRequest.ts    # Human interaction types
├── StateManager.ts             # State slice management
├── types.ts                    # Core type definitions
├── index.ts                    # Package entry point
├── chatCommands.ts             # Command exports
├── tools.ts                    # Tool exports
├── commands/
│   ├── debug.ts                # Debug logging toggle
│   ├── hook.ts                 # Hook management
│   ├── reset.ts                # State reset
│   ├── settings.ts             # Settings display
│   ├── tool.ts                 # Tool management
│   └── work.ts                 # Work handler invocation
├── tools/
│   └── runAgent.ts             # Sub-agent execution tool
└── state/
    └── commandHistoryState.ts  # Command history tracking
```

## Core Components

### AgentTeam

Central orchestrator managing agents, packages, and shared registries.

**Key Methods:**
- `addPackages(packages: TokenRingPackage[])` - Install and start packages
- `createAgent(type: string): Promise<Agent>` - Create agent by type
- `getAgents(): Agent[]` - Get all active agents
- `deleteAgent(agent: Agent): Promise<void>` - Shutdown and remove agent
- `getConfigSlice<T>(key: string, schema: T)` - Get validated config
- `addAgentConfig(name: string, config: AgentConfig)` - Register agent type

**Registries:**
- `packages` - TokenRing packages
- `services` - Shared services (typed registry)
- `chatCommands` - Chat commands
- `tools` - Available tools
- `hooks` - Lifecycle hooks

**State Management:**
- Implements `StateStorageInterface` with `initializeState`, `mutateState`, `getState`

### Agent

Individual AI agent with state management, event emission, and command processing.

**Constructor:**
```typescript
new Agent(agentTeam: AgentTeam, options: AgentConfig)
```

**Core Methods:**
- `initialize(): Promise<void>` - Attach services, run initial commands
- `handleInput({message: string}): Promise<void>` - Process user input
- `runCommand(message: string): Promise<void>` - Execute command or chat
- `createSubAgent(agentType: string): Promise<Agent>` - Create child agent

**State Management:**
- `initializeState<T>(ClassType, props)` - Add state slice
- `getState<T>(ClassType): T` - Retrieve state slice
- `mutateState<T>(ClassType, callback)` - Modify state slice
- `generateCheckpoint(): AgentCheckpointData` - Serialize state
- `restoreCheckpoint(data: AgentCheckpointData)` - Restore state
- `reset(what: ResetWhat[])` - Reset state slices

**Event System:**
- `events(signal: AbortSignal): AsyncGenerator<AgentEventEnvelope>` - Event stream
- `chatOutput(content: string)` - Emit chat output
- `reasoningOutput(content: string)` - Emit reasoning output
- `systemMessage(message: string, level?)` - Emit system message
- `setBusy(message: string)` / `setNotBusy()` / `setIdle()` - State changes
- `requestAbort(reason: string)` - Abort operations

**Human Interaction:**
- `askHuman<T>(request: HumanInterfaceRequest): Promise<T>` - Request input
- `sendHumanResponse(sequence: number, response: any)` - Resolve request

**Utilities:**
- `busyWhile<T>(message: string, awaitable: Promise<T>): Promise<T>`
- `getAbortSignal(): AbortSignal`
- `executeHooks(hookType: HookType, ...args)` - Run lifecycle hooks

### StateManager

Manages state slices with serialization/deserialization.

**Methods:**
- `initializeState<T>(ClassType, props)` - Register state slice
- `getState<T>(ClassType): T` - Get state slice
- `mutateState<T>(ClassType, callback)` - Modify state
- `serialize(): Record<string, object>` - Serialize all slices
- `deserialize(data, onMissing?)` - Restore state
- `reset(what: ResetWhat[])` - Reset slices
- `entries()` - Iterate state slices

**State Slices** implement:
```typescript
interface StateSlice {
  name: string;
  reset(what: ResetWhat[]): void;
  serialize(): object;
  deserialize(data: object): void;
  persistToSubAgents?: boolean;
}
```

### AgentContextService

Provides context items to agents, such as available agent types when the `runAgent` tool is enabled.

**Methods:**
- `getContextItems(agent: Agent): AsyncGenerator<ContextItem>` - Yield context items

## Usage Examples

### Creating an Agent Team

```typescript
import { AgentTeam, packageInfo } from '@tokenring-ai/agent';

const team = new AgentTeam({ /* config */ });
await team.addPackages([packageInfo]);

// Register agent types
team.addAgentConfig('myAgent', {
  name: 'My Agent',
  description: 'Custom agent',
  visual: { color: 'blue' },
  ai: { /* AI config */ },
  initialCommands: [],
  type: 'interactive'
});

const agent = await team.createAgent('myAgent');
await agent.initialize();
```

### Processing Input and Events

```typescript
// Event stream
const controller = new AbortController();
for await (const event of agent.events(controller.signal)) {
  switch (event.type) {
    case 'output.chat':
      console.log('Chat:', event.data.content);
      break;
    case 'output.system':
      console.log(`[${event.data.level}]`, event.data.message);
      break;
    case 'state.idle':
      console.log('Agent ready');
      break;
    case 'human.request':
      const response = await getUserInput(event.data.request);
      agent.sendHumanResponse(event.data.sequence, response);
      break;
  }
}

// Handle input
await agent.handleInput({ message: '/tools enable myTool' });
await agent.handleInput({ message: 'Hello!' });
```

### Creating Sub-Agents

```typescript
const subAgent = await agent.createSubAgent('backgroundWorker');
// Persistent state is copied to sub-agent
// Sub-agent runs independently
await team.deleteAgent(subAgent); // Cleanup
```

### State Management

```typescript
// Define state slice
class MyState implements StateSlice {
  name = 'MyState';
  data: string[] = [];
  
  reset(what: ResetWhat[]) {
    if (what.includes('chat')) this.data = [];
  }
  
  serialize() { return { data: this.data }; }
  deserialize(obj: any) { this.data = obj.data || []; }
}

// Use state
agent.initializeState(MyState, {});
agent.mutateState(MyState, state => state.data.push('item'));
const state = agent.getState(MyState);

// Checkpointing
const checkpoint = agent.generateCheckpoint();
agent.restoreCheckpoint(checkpoint);
```

## Built-in Commands

- `/debug [on|off]` - Toggle debug logging
- `/hooks [list|enable|disable] [hookName]` - Manage hooks
- `/reset [chat|memory|settings|all]` - Reset state
- `/settings` - Show active services and tools
- `/tools [enable|disable|set] <tool1> <tool2>` - Manage tools
- `/work [message]` - Invoke agent's work handler

## Built-in Tools

- `agent/run` - Create sub-agent, send message, wait for response, cleanup
  - Parameters: `agentType`, `message`, `context`

## Event Types

- `output.chat` - Chat output
- `output.reasoning` - Reasoning output
- `output.system` - System messages (info/warning/error)
- `state.busy` - Agent busy
- `state.notBusy` - Agent not busy
- `state.idle` - Agent idle and ready
- `state.aborted` - Operation aborted
- `state.exit` - Exit requested
- `input.received` - Input received
- `human.request` - Human input requested
- `human.response` - Human response provided
- `reset` - State reset

## Configuration

**AgentConfig:**
```typescript
{
  name: string;                    // Agent identifier
  description: string;              // Purpose
  visual: { color: string };        // UI color
  ai: any;                          // AI configuration
  initialCommands: string[];        // Startup commands
  persistent?: boolean;             // Enable checkpointing
  storagePath?: string;             // Storage location
  type: 'interactive' | 'background'; // Agent type
  workHandler?: (msg: string, agent: Agent) => Promise<void>; // Custom work handler
}
```

**AgentTeamConfig:**
```typescript
Record<string, any> // Arbitrary config, accessed via getConfigSlice()
```

## Type Definitions

**TokenRingPackage:**
```typescript
{
  name: string;
  version: string;
  description: string;
  install?(agentTeam: AgentTeam): Promise<void> | void;
  start?(agentTeam: AgentTeam): Promise<void> | void;
}
```

**TokenRingService:**
```typescript
{
  name: string;
  description: string;
  start?(agentTeam: AgentTeam): Promise<void>;
  stop?(agentTeam: AgentTeam): Promise<void>;
  attach?(agent: Agent): Promise<void>;
  detach?(agent: Agent): Promise<void>;
  getContextItems?(agent: Agent): AsyncGenerator<ContextItem>;
}
```

**TokenRingToolDefinition:**
```typescript
{
  name: string;
  description: string;
  execute: (input: object, agent: Agent) => Promise<string | object>;
  inputSchema: Tool['inputSchema']; // Zod schema
  start?(agent: Agent): Promise<void>;
  stop?(agent: Agent): Promise<void>;
}
```

**TokenRingChatCommand:**
```typescript
{
  name?: string;
  description: string;
  execute: (input: string, agent: Agent) => Promise<void | string> | void | string;
  help: () => string | string[];
}
```

**HookConfig:**
```typescript
{
  name: string;
  description: string;
  beforeChatCompletion?(agent: Agent, ...args): Promise<void> | void;
  afterChatCompletion?(agent: Agent, ...args): Promise<void> | void;
  afterAgentInputComplete?(agent: Agent, ...args): Promise<void> | void;
}
```

## Human Interface Requests

Supported request types:
- `askForConfirmation` - Yes/no prompt
- `openWebPage` - Open URL
- `askForSelection` - Single choice
- `ask` - Text input
- `askForPassword` - Password input
- `askForMultipleSelections` - Multiple choices
- `askForSingleTreeSelection` - Tree navigation (single)
- `askForMultipleTreeSelection` - Tree navigation (multiple)

## License

MIT License - Copyright (c) 2025 Mark Dierolfnt(type: string): Promise<Agent>`
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