# @tokenring-ai/agent

The core agent orchestration system for TokenRing AI, enabling creation and management of AI agents with comprehensive state management, event handling, command execution, tool integration, and lifecycle management.

## Overview

The `@tokenring-ai/agent` package provides a complete agent framework with:

- **Agent Management**: Create, spawn, and manage individual AI agents
- **State Management**: Persistent state with serialization and checkpointing
- **Event System**: Comprehensive event handling and emission
- **Command System**: Slash command interface with extensible commands
- **Tool Integration**: Tool execution with context and parameter validation
- **Hook System**: Lifecycle hooks for extensibility
- **Human Interface**: Request/response system for human interaction
- **Sub-Agent Support**: Create and manage child agents
- **Cost Tracking**: Monitor and track resource usage
- **Plugin Integration**: Automatic integration with TokenRing applications

## Installation

```bash
npm install @tokenring-ai/agent
```

## Package Structure

```
pkg/agent/
├── Agent.ts                          # Core Agent class implementation
├── AgentEvents.ts                    # Event type definitions
├── HumanInterfaceRequest.ts          # Human interaction types
├── types.ts                          # Core type definitions
├── index.ts                          # Package exports
├── plugin.ts                         # TokenRing plugin integration
├── package.json                      # Package configuration
├── chatCommands.ts                   # Command exports
├── tools.ts                          # Tool exports
├── commands/                         # Built-in commands
│   ├── debug.ts                      # Debug logging toggle
│   ├── help.ts                       # Help system
│   ├── hook.ts                       # Hook management
│   ├── reset.ts                      # State reset
│   ├── settings.ts                   # Settings display
│   ├── work.ts                       # Work handler invocation
│   └── cost.ts                       # Cost tracking
├── services/                         # Core services
│   ├── AgentCommandService.ts        # Command execution service
│   ├── AgentLifecycleService.ts      # Lifecycle and hooks service
│   └── AgentManager.ts               # Agent management service
├── state/                            # State management
│   ├── agentEventState.ts            # Event state management
│   ├── commandHistoryState.ts        # Command history tracking
│   ├── costTrackingState.ts          # Cost tracking state
│   └── hooksState.ts                 # Hook configuration state
├── tools/                            # Built-in tools
│   └── runAgent.ts                   # Sub-agent execution tool
├── contextHandlers/                  # Context providers
│   └── availableAgents.ts           # Available agents context
├── rpc/                             # RPC endpoints
│   ├── agent.ts                      # Agent RPC implementation
│   └── schema.ts                     # RPC schema definitions
└── util/                            # Utilities
    ├── formatAgentId.ts              # Agent ID formatting
    └── subcommandRouter.ts           # Command routing utilities
```

## Core Components

### Agent Class

The central agent implementation providing comprehensive AI agent functionality:

```typescript
import Agent from "@tokenring-ai/agent";

const agent = new Agent(app, { config: agentConfig, headless: false });
```

**Key Properties:**
- `id`: Unique agent identifier (UUID)
- `name`: Agent name
- `description`: Agent description
- `config`: Parsed agent configuration
- `debugEnabled`: Debug logging toggle
- `headless`: Headless operation mode

**State Management Methods:**
- `initializeState<T>(ClassType, props)`: Initialize state slice
- `getState<T>(ClassType)`: Retrieve state slice
- `mutateState<T>(ClassType, callback)`: Modify state slice
- `subscribeState<T>(ClassType, callback)`: Subscribe to state changes
- `generateCheckpoint()`: Create state checkpoint
- `restoreState(state)`: Restore from checkpoint
- `reset(what)`: Reset specific state components

**Input Processing:**
- `handleInput({message})`: Process user input with event emission
- `runCommand(command)`: Execute agent commands
- `busyWhile<T>(message, awaitable)`: Execute with busy state

**Event Emission:**
- `chatOutput(content)`: Emit chat output
- `reasoningOutput(content)`: Emit reasoning content
- `systemMessage(message, level)`: Emit system messages
- `emit(event)`: Emit custom events

**Human Interface:**
- `askHuman<T>(request)`: Request human input
- `sendHumanResponse(requestId, response)`: Send human response

**Lifecycle Management:**
- `requestAbort(reason)`: Abort current operations
- `getAbortSignal()`: Get abort signal
- `getIdleDuration()`: Get time since last activity

### AgentManager Service

Central service for managing agent lifecycles and configurations:

```typescript
const agentManager = new AgentManager(app);

// Add agent configurations
agentManager.addAgentConfigs({
  myAgent: {
    name: "My Agent",
    description: "Custom agent description",
    category: "development",
    visual: { color: "blue" },
    type: "interactive",
    initialCommands: ["/help"],
    debug: false
  }
});

// Spawn agents
const agent = await agentManager.spawnAgent({ 
  agentType: "myAgent", 
  headless: false 
});
```

**Key Methods:**
- `addAgentConfig(name, config)`: Register agent configuration
- `spawnAgent({agentType, headless})`: Create new agent
- `spawnSubAgent(agent, {agentType, headless})`: Create sub-agent
- `getAgent(id)`: Get agent by ID
- `getAgents()`: Get all active agents
- `deleteAgent(agent)`: Shutdown and remove agent

**Lifecycle Management:**
- Automatic idle agent cleanup
- Configurable idle timeouts
- Graceful shutdown handling

### AgentCommandService Service

Service for managing and executing agent commands:

```typescript
const commandService = new AgentCommandService();

// Commands are automatically registered via plugin
// Execute commands via agent
await agent.runCommand("/help");
await agent.runCommand("Hello, agent!");
```

**Command Processing:**
- Automatic slash command parsing
- Default chat command fallback (`/chat send`)
- Command singular/plural name handling
- Error handling for unknown commands

### AgentLifecycleService Service

Service for managing hooks and lifecycle events:

```typescript
const lifecycleService = new AgentLifecycleService();

// Hooks are automatically registered via plugin
lifecycleService.enableHooks(["myPlugin/afterChatCompletion"], agent);

// Execute hooks manually
await lifecycleService.executeHooks(agent, "afterChatCompletion", args);
```

**Hook Management:**
- Register hooks with package namespacing
- Enable/disable hooks per agent
- Execute hooks on lifecycle events
- Support for multiple hook types

## Configuration

### AgentConfig Schema

```typescript
const agentConfig = {
  name: string,              // Agent identifier
  description: string,       // Agent purpose
  category: string,          // Agent category
  debug?: boolean,          // Enable debug logging
  visual: {
    color: string           // UI color theme
  },
  workHandler?: Function,   // Custom work handler
  initialCommands: string[], // Startup commands
  persistent?: boolean,     // Enable checkpointing
  storagePath?: string,     // Storage location
  type: "interactive" | "background", // Agent type
  callable?: boolean,       // Enable tool calls
  idleTimeout?: number,     // Idle timeout in seconds
  maxRunTime?: number       // Max runtime in seconds
};
```

### Plugin Configuration

The agent package automatically integrates with TokenRing applications:

```typescript
// Automatic registration via plugin
const app = new TokenRingApp();

// Agents configured in app config
const config = {
  agents: {
    myAgent: {
      name: "My Agent",
      description: "Custom agent",
      category: "development",
      visual: { color: "blue" },
      type: "interactive"
    }
  }
};
```

## Usage Examples

### Basic Agent Creation and Usage

```typescript
import Agent from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";

const app = new TokenRingApp();

// Create agent
const agent = new Agent(app, {
  config: {
    name: "My Agent",
    description: "Custom development agent",
    category: "development", 
    visual: { color: "blue" },
    type: "interactive",
    initialCommands: ["/help"]
  },
  headless: false
});

// Initialize agent
await agent.initialize();

// Handle user input
const requestId = agent.handleInput({ message: "Hello! How can you help me?" });

// Listen to events
agent.subscribeState(AgentEventState, (state) => {
  for (const event of state.events) {
    console.log("Event:", event.type, event);
  }
});
```

### State Management and Checkpointing

```typescript
// Initialize custom state
class MyCustomState implements AgentStateSlice {
  name = "MyCustomState";
  data: string[] = [];
  
  reset(what: ResetWhat[]) {
    if (what.includes('chat')) this.data = [];
  }
  
  serialize() { return { data: this.data }; }
  deserialize(obj: any) { this.data = obj.data || []; }
}

// Use state in agent
agent.initializeState(MyCustomState, {});

// Modify state
agent.mutateState(MyCustomState, (state) => {
  state.data.push("item");
});

// Create checkpoint
const checkpoint = agent.generateCheckpoint();
console.log("Checkpoint:", checkpoint);

// Restore from checkpoint
agent.restoreState(checkpoint.state);
```

### Sub-Agent Creation

```typescript
// Create sub-agent from parent
const subAgent = await agentManager.spawnSubAgent(agent, {
  agentType: "backgroundWorker",
  headless: true
});

// Send message to sub-agent
await subAgent.handleInput({ message: "Process this data" });

// Sub-agent state is automatically copied from parent
await agentManager.deleteAgent(subAgent);
```

### Tool Execution

```typescript
// Built-in tool: runAgent
const result = await agent.runAgent({
  agentType: "dataProcessor",
  message: "Analyze this dataset",
  context: "File: data.csv\nColumns: name,age,income",
  forwardChatOutput: true,
  forwardSystemOutput: true,
  timeout: 300
});

console.log("Tool result:", result);
```

### Hook System

```typescript
// Register hook
const hookConfig: HookConfig = {
  name: "myPlugin/afterChatCompletion",
  description: "Custom after chat completion hook",
  afterChatCompletion: async (agent, ...args) => {
    console.log("Chat completed:", args);
  }
};

// Enable hook for agent
lifecycleService.registerHook("myPlugin/afterChatCompletion", hookConfig);
lifecycleService.enableHooks(["myPlugin/afterChatCompletion"], agent);

// Hooks automatically execute on lifecycle events
```

### Human Interface Requests

```typescript
// Agent requests human input
const selection = await agent.askHuman({
  type: "askForSelection",
  prompt: "Choose an option",
  options: ["Option 1", "Option 2", "Option 3"]
});

// Handle human response
agent.sendHumanResponse(requestId, selection);
```

## Built-in Commands

### Debug Commands
- `/debug [on|off]` - Toggle debug logging

### Hook Management
- `/hooks [list|enable|disable] [hookName]` - Manage hooks

### Reset Commands
- `/reset [chat|memory|settings|all]` - Reset state components

### Settings
- `/settings` - Display active services and tools

### Work Handler
- `/work [message]` - Invoke custom work handler

### Cost Tracking
- `/cost` - Display cost tracking information

### Help System
- `/help [command]` - Show help information

## Built-in Tools

### agent/run Tool

Creates a temporary sub-agent, sends a message, and cleans up:

```typescript
const tool = {
  name: "agent/run",
  description: "Create sub-agent for specific tasks",
  inputSchema: {
    agentType: z.string(),
    message: z.string(),
    context: z.string().optional(),
    forwardChatOutput: z.boolean().default(true),
    forwardSystemOutput: z.boolean().default(true),
    timeout: z.number().optional()
  }
};
```

## Event System

### Event Types

**Input Events:**
- `input.received` - Input received from user
- `input.handled` - Input processing completed

**Output Events:**
- `output.chat` - Chat output
- `output.reasoning` - Reasoning output
- `output.system` - System messages

**State Events:**
- `reset` - State reset
- `human.request` - Human input requested
- `human.response` - Human response provided

### Event Handling

```typescript
// Subscribe to agent events
agent.subscribeState(AgentEventState, (state) => {
  const latestEvent = state.events[state.events.length - 1];
  
  switch (latestEvent.type) {
    case "output.chat":
      console.log("Chat:", latestEvent.content);
      break;
    case "output.system":
      console.log(`[${latestEvent.level}]`, latestEvent.message);
      break;
    case "human.request":
      // Handle human interface request
      break;
  }
});
```

## Integration Patterns

### TokenRing Plugin Integration

The agent package automatically integrates with TokenRing applications:

```typescript
// Plugin automatically registers:
- Chat service integration
- Agent command service
- Agent manager service  
- Agent lifecycle service
- Web host RPC endpoints
- Context handlers
- Tools and commands
```

### Service Dependencies

- **ChatService**: For command and tool integration
- **WebHostService**: For RPC endpoint registration
- **FileSystemService**: For file operations
- **CheckpointService**: For state persistence

### Context Handlers

- **available-agents**: Provides list of available agent types

## State Management

### State Slices

Agents support multiple state slices for different concerns:

**Built-in State Slices:**
- **AgentEventState**: Event history and current state
- **CommandHistoryState**: Command execution history
- **CostTrackingState**: Resource usage tracking
- **HooksState**: Hook configuration and enabled hooks

**Custom State Slices:**
```typescript
class CustomState implements AgentStateSlice {
  name = "CustomState";
  // Implement required methods
}
```

### Checkpointing

```typescript
// Generate checkpoint
const checkpoint = agent.generateCheckpoint();

// Restore from checkpoint
const restoredAgent = await Agent.createAgentFromCheckpoint(
  app, 
  checkpoint, 
  { headless: false }
);
```

## Error Handling

The agent system provides comprehensive error handling:

- **Command Errors**: Unknown commands, execution errors
- **State Errors**: Invalid state operations, deserialization failures
- **Hook Errors**: Hook execution failures
- **Timeout Errors**: Operation timeouts
- **Abort Errors**: Operation cancellation

## Performance Considerations

- **Idle Cleanup**: Automatic cleanup of idle agents
- **Memory Management**: State serialization for memory efficiency
- **Event Batching**: Efficient event emission and handling
- **Hook Performance**: Minimal overhead for hook system

## Dependencies

- **@tokenring-ai/chat**: Chat service integration
- **@tokenring-ai/utility**: Utilities and registries
- **@tokenring-ai/app**: Application framework
- **@tokenring-ai/web-host**: Web host integration
- **zod**: Schema validation
- **eventemitter3**: Event handling
- **uuid**: Unique identifier generation
- **glob-gitignore**: File pattern matching

## Development

### Building
```bash
npm run build
```

### Testing
```bash
npm test
```

### Plugin Development

Create custom plugins for agent functionality:

```typescript
import { TokenRingPlugin } from "@tokenring-ai/app";

const myAgentPlugin: TokenRingPlugin = {
  name: "my-plugin",
  install(app) {
    // Register custom commands
    // Register custom tools
    // Register custom hooks
    // Register custom state slices
  }
};
```

## Version History

- **0.2.0**: Current version with comprehensive agent framework
- Complete state management and checkpointing
- Event-driven architecture
- Comprehensive command and tool system
- Plugin integration and lifecycle management

## License

MIT

## Related Packages

- **@tokenring-ai/chat**: Chat service and tool integration
- **@tokenring-ai/app**: Application framework
- **@tokenring-ai/web-host**: Web host and RPC integration
- **@tokenring-ai/utility**: Utilities and registries