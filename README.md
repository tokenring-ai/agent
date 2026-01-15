# @tokenring-ai/agent

## Overview
The core agent orchestration system for TokenRing AI, enabling creation and management of AI agents with comprehensive state management, event handling, command execution, tool integration, and lifecycle management. This package provides a complete agent framework that integrates seamlessly with the TokenRing ecosystem.

## Features
- **Agent Management**: Create, spawn, and manage individual AI agents
- **State Management**: Persistent state with serialization and checkpointing
- **Event System**: Comprehensive event handling and emission
- **Command System**: Slash command interface with extensible commands
- **Tool Integration**: Tool execution with context and parameter validation
- **Hook System**: Lifecycle hooks for extensibility
- **Human Interface**: Request/response system for human interaction
- **Sub-Agent Support**: Create and manage child agents
- **Cost Tracking**: Monitor and track resource usage
- **RPC Integration**: JSON-RPC endpoints for remote agent management
- **Plugin Integration**: Automatic integration with TokenRing applications
- **Form Support**: Complex form-based human input requests
- **Idle/Max Runtime Management**: Automatic cleanup of idle or long-running agents

## Installation

```bash
bun install @tokenring-ai/agent
```

## Core Components/API

### Agent Class

The central agent implementation providing comprehensive AI agent functionality:

```typescript
import Agent from "@tokenring-ai/agent";

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
```

**Key Properties:**
- `id`: Unique agent identifier (UUID)
- `name`: Agent name
- `description`: Agent description
- `config`: Parsed agent configuration
- `debugEnabled`: Debug logging toggle
- `headless`: Headless operation mode
- `app`: TokenRing application instance
- `stateManager`: State management system

**State Management Methods:**
- `initializeState<T>(ClassType, props)`: Initialize state slice
- `getState<T>(ClassType)`: Retrieve state slice
- `mutateState<T>(ClassType, callback)`: Modify state slice
- `subscribeState<T>(ClassType, callback)`: Subscribe to state changes
- `waitForState<T>(ClassType, predicate)`: Wait for state condition
- `timedWaitForState<T>(ClassType, predicate, timeout)`: Wait with timeout
- `subscribeStateAsync<T>(ClassType, callback)`: Subscribe asynchronously
- `generateCheckpoint()`: Create state checkpoint
- `restoreState(state)`: Restore from checkpoint

**Input Processing:**
- `handleInput({message})`: Process user input with event emission
- `runCommand(command)`: Execute agent commands
- `busyWhile<T>(message, awaitable)`: Execute with busy state
- `setBusyWith(message)`: Set busy status indicator
- `setStatusLine(status)`: Set status line indicator

**Event Emission:**
- `chatOutput(content)`: Emit chat output
- `reasoningOutput(content)`: Emit reasoning content
- `systemMessage(message, level)`: Emit system messages
- `infoMessage(...messages)`: Emit info messages
- `warningMessage(...messages)`: Emit warning messages
- `errorMessage(...messages)`: Emit error messages
- `debugMessage(...messages)`: Emit debug messages (if debugEnabled)
- `emit(event)`: Emit custom events

**Human Interface:**
- `askHuman<T>(request)`: Request human input
- `sendHumanResponse(requestId, response)`: Send human response

**Lifecycle Management:**
- `requestAbort(reason)`: Abort current operations
- `getAbortSignal()`: Get abort signal
- `getIdleDuration()`: Get time since last activity
- `getRunDuration()`: Get total run duration
- `reset(what)`: Reset specific state components
- `shutdown(reason)`: Shutdown agent completely

**Configuration Access:**
- `getAgentConfigSlice<T>(key, schema)`: Get config value with validation

**Checkpoint Creation:**
- `static createAgentFromCheckpoint(app, checkpoint, {headless})`: Create agent from checkpoint

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
    initialCommands: ["/help"]
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
- `addAgentConfigs(configs)`: Register multiple agent configurations
- `getAgentTypes()`: Get all available agent types
- `getAgentConfigs()`: Get all agent configurations
- `spawnAgent({agentType, headless})`: Create new agent
- `spawnSubAgent(agent, {agentType, headless})`: Create sub-agent
- `spawnAgentFromConfig(config, {headless})`: Create agent from config
- `spawnAgentFromCheckpoint(app, checkpoint, {headless})`: Create from checkpoint
- `getAgent(id)`: Get agent by ID
- `getAgents()`: Get all active agents
- `deleteAgent(agent)`: Shutdown and remove agent

**Automatic Lifecycle Management:**
- Idle agent cleanup every 60 seconds
- Configurable `idleTimeout` per agent (default: 86400 seconds)
- Configurable `maxRunTime` per agent (default: 0 = no limit)

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

**Key Methods:**
- `addAgentCommands(commands)`: Register commands
- `getCommandNames()`: Get all command names
- `getCommands()`: Get all commands
- `getCommand(name)`: Get specific command
- `executeAgentCommand(agent, message)`: Execute command

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
- `registerHook(name, config)`: Register individual hook
- `addHooks(pkgName, hooks)`: Register hooks with package namespacing
- `getRegisteredHooks()`: Get all registered hooks
- `getEnabledHooks(agent)`: Get enabled hooks for agent
- `setEnabledHooks(hookNames, agent)`: Set enabled hooks
- `enableHooks(hookNames, agent)`: Enable specific hooks
- `disableHooks(hookNames, agent)`: Disable hooks
- `executeHooks(agent, hookType, ...args)`: Execute hooks

**Hook Types:**
- `beforeChatCompletion`: Called before chat completion
- `afterChatCompletion`: Called after chat completion
- `afterAgentInputComplete`: Called after agent input is fully processed

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
  
  show() {
    return [`Data items: ${this.data.length}`];
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
const restoredAgent = await Agent.createAgentFromCheckpoint(
  app, 
  checkpoint, 
  { headless: false }
);
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

### Advanced Sub-Agent Execution

```typescript
import { runSubAgent } from "@tokenring-ai/agent/runSubAgent";

// Run sub-agent with custom options
const result = await runSubAgent({
  agentType: "code-assistant",
  headless: true,
  command: "/work Analyze this code: function test() { return true; }",
  forwardChatOutput: true,
  forwardSystemOutput: true,
  forwardReasoning: true,
  forwardHumanRequests: true,
  forwardInputCommands: true,
  timeout: 60,
  maxResponseLength: 1000,
  minContextLength: 300,
  background: false
}, agent, true);

console.log("Result:", result.status, result.response);
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
// Simple confirmation
const confirmed = await agent.askHuman({
  type: "askForConfirmation",
  message: "Are you sure you want to proceed?"
});

// Text input
const text = await agent.askHuman({
  type: "askForText",
  message: "Enter your name:"
});

// Single tree selection
const selection = await agent.askHuman({
  type: "askForSingleTreeSelection",
  title: "Choose an option",
  tree: {
    name: "root",
    hasChildren: true,
    children: [
      { name: "Option 1", value: "opt1" },
      { name: "Option 2", value: "opt2" }
    ]
  }
});

// Complex form
const formData = await agent.askHuman({
  type: "askForForm",
  name: "contactForm",
  description: "Please fill out the contact form",
  sections: [
    {
      name: "personal",
      description: "Personal Information",
      fields: [
        { type: "text", label: "Full Name", key: "name", required: true },
        { type: "text", label: "Email", key: "email", required: true }
      ]
    },
    {
      name: "preferences",
      description: "Preferences",
      fields: [
        { 
          type: "selectOne", 
          label: "Category", 
          key: "category", 
          options: [
            { label: "Support", value: "support" },
            { label: "Sales", value: "sales" }
          ]
        }
      ]
    }
  ]
});

// Handle human response
agent.sendHumanResponse(requestId, selection);
```

### Cost Tracking

```typescript
// Add cost tracking
agent.addCost("api_calls", 1);
agent.addCost("tokens", 1500);

// View cost information
await agent.runCommand("/cost");
```

### Status Line Management

```typescript
// Set busy status
agent.setBusyWith("Processing request...");

// Set status line
agent.setStatusLine("Ready for input");

// Clear status indicators
agent.setBusyWith(null);
agent.setStatusLine(null);
```

## Configuration

### AgentConfig Schema

```typescript
const agentConfig = {
  name: string,                    // Agent identifier
  description: string,             // Agent purpose
  category: string,                // Agent category
  debug?: boolean,                 // Enable debug logging (default: false)
  visual: {
    color: string                  // UI color theme
  },
  workHandler?: Function,          // Custom work handler
  initialCommands: string[],       // Startup commands
  persistent?: boolean,            // Enable checkpointing
  storagePath?: string,            // Storage location
  type: "interactive" | "background", // Agent type
  callable?: boolean,              // Enable tool calls (default: true)
  idleTimeout?: number,            // Idle timeout in seconds (default: 86400)
  maxRunTime?: number              // Max runtime in seconds (default: 0 = unlimited)
};
```

## Event System

### Event Types

**Input Events:**
- `input.received` - Input received from user
- `input.handled` - Input processing completed (status: success, error, or cancelled)

**Output Events:**
- `output.chat` - Chat output
- `output.reasoning` - Reasoning output
- `output.info` - Informational messages
- `output.warning` - Warning messages
- `output.error` - Error messages

**State Events:**
- `reset` - State reset
- `human.request` - Human input requested
- `human.response` - Human response provided
- `abort` - Operation aborted
- `agent.created` - Agent was created
- `agent.stopped` - Agent was stopped

### Event Schema

All events follow this structure:
```typescript
{
  type: EventType,
  timestamp: number,
  // Event-specific fields
}
```

## Plugin Configuration

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

## Integration

### TokenRing Plugin Integration

The agent package automatically integrates with TokenRing applications:

```typescript
// Plugin automatically registers:
// - Chat service integration
// - Agent command service
// - Agent manager service
// - Agent lifecycle service
// - Web host RPC endpoints
// - Context handlers
// - Tools and commands
```

### Context Handlers

- **available-agents**: Provides list of available agent types
- **todo-list**: Provides todo list context

### RPC Endpoints

| Endpoint | Request Params | Response |
|----------|---------------|----------|
| `listAgents` | None | Array of agent information |
| `spawnAgent` | `{agentType, headless}` | Created agent details |
| `sendMessage` | `{agentId, message}` | Response from agent |

## State Management

### State Slices

Agents support multiple state slices for different concerns:

**Built-in State Slices:**
- **AgentEventState**: Event history and current state
- **CommandHistoryState**: Command execution history
- **CostTrackingState**: Resource usage tracking
- **HooksState**: Hook configuration and enabled hooks
- **TodoState**: Task list management

**Custom State Slices:**
```typescript
class CustomState implements AgentStateSlice {
  name = "CustomState";
  reset(what: ResetWhat[]) {
    // Implementation
  }
  show(): string[] {
    return ["Custom state data"];
  }
  serialize() {
    return { data: this.data };
  }
  deserialize(obj: any) {
    // Implementation
  }
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

## Human Interface Types

### Form Fields

```typescript
// Text field
{ type: 'text', label: 'Name', key: 'name', required: true }

// Select one field
{ 
  type: 'selectOne', 
  label: 'Category', 
  key: 'category', 
  options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] 
}

// Select many field
{ 
  type: 'selectMany', 
  label: 'Tags', 
  key: 'tags', 
  options: [{ label: 'Tag 1', value: 't1' }] 
}

// Directory picker
{ type: 'directory', label: 'Folder', key: 'folder' }

// File picker
{ type: 'file', label: 'File', key: 'file' }

// Multiple file picker
{ type: 'multipleFile', label: 'Files', key: 'files' }

// Tree selection (single)
{ type: 'askForSingleTreeSelection', title: 'Select', tree: treeLeaf }

// Tree selection (multiple)
{ type: 'askForMultipleTreeSelection', title: 'Select', tree: treeLeaf }
```

### Tree Leaf Structure

```typescript
{
  name: string,
  value?: string,
  hasChildren?: boolean,
  children?: TreeLeaf[] | (() => TreeLeaf[] | Promise<TreeLeaf[]>)
}
```

## Development

### Testing

```bash
bun run test
bun run test:coverage
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

### Package Structure

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
├── runSubAgent.ts                    # Sub-agent execution helper
├── commands/                         # Built-in commands
│   ├── agent.ts                      # Agent management commands
│   ├── cost.ts                       # Cost tracking commands
│   ├── work.ts                       # Work handler invocation
│   ├── settings.ts                   # Settings display
│   ├── reset.ts                      # State reset
│   ├── hook.ts                       # Hook management
│   ├── help.ts                       # Help system
│   └── debug/
│       ├── logging.ts                # Debug logging controls
│       ├── markdown.ts               # Markdown rendering test
│       ├── services.ts               # Service logs display
│       └── index.ts                  # Main debug command
├── services/                         # Core services
│   ├── AgentManager.ts               # Agent management service
│   ├── AgentLifecycleService.ts      # Lifecycle and hooks service
│   └── AgentCommandService.ts        # Command execution service
├── state/                            # State management
│   ├── agentEventState.ts            # Event state management
│   ├── commandHistoryState.ts        # Command history tracking
│   ├── costTrackingState.ts          # Cost tracking state
│   ├── hooksState.ts                 # Hook configuration state
│   └── todoState.ts                  # Todo state management
├── tools/                            # Built-in tools
│   ├── runAgent.ts                   # Sub-agent execution tool
│   └── todo.ts                       # Todo list management tool
├── contextHandlers/                  # Context providers
│   ├── availableAgents.ts            # Available agents context
│   └── todo.ts                       # Todo context provider
├── rpc/                              # RPC endpoints
│   ├── agent.ts                      # Agent RPC implementation
│   └── schema.ts                     # RPC schema definitions
└── util/                             # Utilities
    ├── formatAgentId.ts              # Agent ID formatting
    └── subcommandRouter.ts           # Command routing utilities
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
