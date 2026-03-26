# @tokenring-ai/agent

## Overview

The core agent orchestration system for TokenRing AI, enabling creation and management of AI agents with comprehensive
state management, event handling, command execution, tool integration, and lifecycle management. This package provides a
complete agent framework that integrates seamlessly with the TokenRing ecosystem.

## Key Features

- **Agent Management**: Create, spawn, and manage individual AI agents with configurable lifecycles
- **State Management**: Persistent state with serialization, checkpointing, and restoration
- **Event System**: Comprehensive event handling with streaming capabilities
- **Command System**: Slash command interface with extensible commands and automatic command registration
- **Agent Command Registration**: Register agents as callable commands for easy invocation
- **Tool Integration**: Tool execution with context and parameter validation
- **Human Interface**: Request/response system for human interaction with multiple question types
- **Sub-Agent Support**: Create and manage child agents with configurable output forwarding
- **RPC Integration**: JSON-RPC endpoints for remote agent management
- **Plugin Integration**: Automatic integration with TokenRing applications
- **Idle/Max Runtime Management**: Automatic cleanup of idle or long-running agents
- **Minimum Agent Count**: Maintain minimum number of agents per type
- **Todo Management**: Built-in todo list with sub-agent state transfer
- **Abort Handling**: Graceful abort handling with cleanup

## Installation

```bash
bun install @tokenring-ai/agent
```

## Exports

The package exports the following:

```typescript
// Main exports
import Agent from "@tokenring-ai/agent";
import AgentManager from "@tokenring-ai/agent";
import AgentCommandService from "@tokenring-ai/agent";
import SubAgentService from "@tokenring-ai/agent";

// Type exports
import type {RunSubAgentOptions, RunSubAgentResult} from "@tokenring-ai/agent";

// Service exports
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import AgentCommandService from "@tokenring-ai/agent/services/AgentCommandService";
import SubAgentService from "@tokenring-ai/agent/services/SubAgentService";

// State exports
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {TodoState} from "@tokenring-ai/agent/state/todoState";
import {SubAgentState} from "@tokenring-ai/agent/state/subAgentState";

// Schema exports
import {AgentConfigSchema, AgentPackageConfigSchema} from "@tokenring-ai/agent/schema";

// Type exports
import type {AgentCheckpointData, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import type {RunSubAgentOptions, RunSubAgentResult} from "@tokenring-ai/agent";
```

## Dependencies

- `@tokenring-ai/chat` - Chat service integration
- `@tokenring-ai/utility` - Shared utilities
- `@tokenring-ai/app` - Base application framework
- `@tokenring-ai/lifecycle` - Lifecycle hooks integration
- `@tokenring-ai/rpc` - RPC service integration
- `eventemitter3` - Event handling
- `uuid` - Unique ID generation
- `glob-gitignore` - Gitignore parsing
- `zod` - Schema validation

## Core Components/API

### Agent Class

The central agent implementation providing comprehensive AI agent functionality:

```typescript
import Agent from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import {ParsedAgentConfig} from "@tokenring-ai/agent/schema";

const app = new TokenRingApp();

// Agent is typically created via AgentManager, not directly
// But can be created directly if needed:
const config: ParsedAgentConfig = {
  agentType: "myAgent",
  displayName: "My Agent",
  description: "Custom development agent",
  category: "development",
  debug: false,
  initialCommands: [],
  headless: false,
  callable: true,
  idleTimeout: 0,
  maxRunTime: 0,
  minimumRunning: 0,
  subAgent: {},
  allowedSubAgents: [],
  todos: {},
  createMessage: "Agent Created"
};

const shutdownController = new AbortController();
const agent = new Agent(app, {}, config, shutdownController.signal);
```

**Key Properties:**

| Property              | Type                | Description                    |
|-----------------------|---------------------|--------------------------------|
| `id`                  | `string`            | Unique agent identifier (human-readable ID) |
| `displayName`         | `string`            | Agent display name             |
| `config`              | `ParsedAgentConfig` | Parsed agent configuration     |
| `debugEnabled`        | `boolean`           | Debug logging toggle           |
| `headless`            | `boolean`           | Headless operation mode        |
| `app`                 | `TokenRingApp`      | TokenRing application instance |
| `stateManager`        | `StateManager`      | State management system        |
| `agentShutdownSignal` | `AbortSignal`       | Agent shutdown signal          |

**State Management Methods:**

| Method                                                | Description                                  |
|-------------------------------------------------------|----------------------------------------------|
| `initializeState<T>(ClassType, props)`                | Initialize state slice with properties       |
| `getState<T>(ClassType)`                              | Retrieve state slice                         |
| `mutateState<T>(ClassType, callback)`                 | Modify state slice with callback             |
| `subscribeState<T>(ClassType, callback)`              | Subscribe to state changes                   |
| `waitForState<T>(ClassType, predicate)`               | Wait for state condition                     |
| `subscribeStateAsync<T>(ClassType)`                   | Subscribe asynchronously with async iterator |
| `generateCheckpoint()`                                | Create state checkpoint for restoration      |
| `restoreState(state)`                                 | Restore from checkpoint state                |

**Input Processing:**

| Method                                | Description                                               |
|---------------------------------------|-----------------------------------------------------------|
| `handleInput({message, attachments})` | Process user input with event emission, returns requestId |
| `runCommand(command)`                 | Execute agent commands                                    |
| `busyWithActivity<T>(message, awaitable)` | Execute with busy state indicator                   |
| `setCurrentActivity(message)`         | Set current activity indicator                            |
| `getAbortSignal()`                    | Get current abort signal (when executing)                 |

**Event Emission:**

| Method                                             | Description                           |
|----------------------------------------------------|---------------------------------------|
| `chatOutput(message)`                              | Emit chat output event                |
| `reasoningOutput(message)`                         | Emit reasoning output event           |
| `infoMessage(...messages)`                         | Emit informational messages           |
| `warningMessage(...messages)`                      | Emit warning messages                 |
| `errorMessage(...messages)`                        | Emit error messages                   |
| `artifactOutput({name, encoding, mimeType, body})` | Emit output artifact                  |

**Human Interface:**

| Method                                               | Description                                                   |
|------------------------------------------------------|---------------------------------------------------------------|
| `askForApproval({message, label, default, autoSubmitAfter})` | Request approval (Yes/No), returns `Promise<boolean \| null>` |
| `askForText({message, label, masked})`               | Request text input, returns `Promise<string \| null>`         |
| `askQuestion<T>(question)`                           | Request human input with various question types               |
| `sendInteractionResponse(response)`                  | Send human response to interaction                            |
| `waitForInteraction(interaction)`                    | Wait for user interaction                                     |

**Lifecycle Management:**

| Method                                | Description                                  |
|---------------------------------------|----------------------------------------------|
| `abortCurrentOperation(reason)`       | Abort current operation with reason          |
| `getIdleDuration()`                   | Get time since last activity in milliseconds |
| `getRunDuration()`                    | Get total run duration in milliseconds       |
| `runBackgroundTask(task)`             | Run a background task with error handling    |
| `getAgentConfigSlice<T>(key, schema)` | Get config value with validation             |

**Checkpoint Creation:**

```typescript
const checkpoint = agent.generateCheckpoint();
// Returns: { agentId, createdAt, sessionId, agentType, state }
```

### AgentManager Service

Central service for managing agent lifecycles and configurations:

```typescript
import AgentManager from "@tokenring-ai/agent/services/AgentManager";

const agentManager = new AgentManager(app);

// Add agent configurations
agentManager.addAgentConfigs({
  agentType: "myAgent",
  displayName: "My Agent",
  description: "Custom development agent",
  category: "development",
  debug: false,
  initialCommands: [],
  headless: false,
  callable: true,
  idleTimeout: 0,
  maxRunTime: 0,
  minimumRunning: 0,
  subAgent: {},
  allowedSubAgents: [],
  todos: {},
  createMessage: "Agent Created"
});

// Spawn agents
const agent = await agentManager.spawnAgent({
  agentType: "myAgent",
  headless: false
});

// Spawn from config
const agent = await agentManager.spawnAgentFromConfig(config);

// Spawn sub-agent
const subAgent = await agentManager.spawnSubAgent(parentAgent, "workerAgent", {
  headless: true
});

// Get agents
const agent = agentManager.getAgent(agentId);
const allAgents = agentManager.getAgents();
const agentTypes = agentManager.getAgentTypes();

// Delete agent
await agentManager.deleteAgent(agentId, "Reason for deletion");
```

**Key Methods:**

| Method                                         | Description                              |
|------------------------------------------------|------------------------------------------|
| `addAgentConfigs(...configs)`                  | Register multiple agent configurations   |
| `getAgentConfigEntries()`                      | Get all agent configuration entries      |
| `getAgentConfig(name)`                         | Get specific agent configuration by name |
| `getAgentTypes()`                              | Get all available agent types            |
| `getAgentTypesLike(pattern)`                   | Get agent types matching glob pattern    |
| `spawnAgent({agentType, headless})`            | Create new agent of specified type       |
| `spawnSubAgent(agent, agentType, config)`      | Create sub-agent with parent             |
| `spawnAgentFromConfig(config)`                 | Create agent from configuration          |
| `spawnAgentFromCheckpoint(checkpoint, config)` | Create agent from checkpoint             |
| `getAgent(id)`                                 | Get agent by ID, returns `Agent \| null` |
| `getAgents()`                                  | Get all active agents                    |
| `deleteAgent(agentId, reason)`                 | Shutdown and remove agent                |

**Automatic Lifecycle Management:**

- Idle agent cleanup every 15 seconds
- Configurable `idleTimeout` per agent (default: 0 = no limit, in seconds)
- Configurable `maxRunTime` per agent (default: 0 = no limit, in seconds)
- Configurable `minimumRunning` per agent type (default: 0 = no minimum)

**Automatic Command Registration:**

When an agent config includes the `command` option, the agent is automatically registered as a callable command.
See [Agent Command Registration](#agent-command-registration) for details.

### AgentCommandService Service

Service for managing and executing agent commands:

```typescript
import AgentCommandService from "@tokenring-ai/agent/services/AgentCommandService";

const commandService = new AgentCommandService(app);

// Commands are automatically registered via plugin
// Execute commands via agent
await agent.runCommand("/help");
await agent.runCommand("Hello, agent!");

// Add custom commands
commandService.addAgentCommands({
  name: "myCommand",
  description: "My custom command",
  inputSchema: {
    remainder: {
      name: "message",
      description: "Message to process",
      required: true,
    }
  },
  execute: async ({remainder, agent}) => {
    return `Processed: ${remainder}`;
  },
  help: "# /myCommand\\n\\nMy custom command help text"
});
```

**Command Processing**:

- Automatic slash command parsing
- Default chat command fallback (`/chat send`) for plain text
- Command singular/plural name handling
- Agent mention handling (`@agentName message` converts to `/agent run agentName message`)
- Error handling for unknown commands with suggestions
- Support for command attachments

**Key Methods**:

| Method                                             | Description                   |
|----------------------------------------------------|-------------------------------|
| `addAgentCommands(...commands)`                    | Register one or more commands |
| `getCommandNames()`                                | Get all command names         |
| `getCommandEntries()`                              | Get all command entries       |
| `getCommand(name)`                                 | Get specific command by name  |
| `executeAgentCommand(agent, message, attachments)` | Execute command               |

### SubAgentService Service

Service for managing sub-agent execution and permissions:

```typescript
import SubAgentService from "@tokenring-ai/agent/services/SubAgentService";

const subAgentService = new SubAgentService(app);

// Run a sub-agent with forwarding options
const result = await subAgentService.runSubAgent({
  agentType: "worker",
  headless: true,
  input: {
    from: "parent",
    message: "/work Process this data"
  },
  parentAgent: agent,
  options: {
    forwardChatOutput: true,
    forwardSystemOutput: true,
    forwardHumanRequests: true,
  },
  autoCleanup: true,
  checkPermissions: true,
});

console.log(result.status, result.response);
```

**Key Methods**:

| Method                                             | Description                                      |
|----------------------------------------------------|--------------------------------------------------|
| `attach(agent, creationContext)`                   | Attach to agent and configure permissions        |
| `runSubAgent(options)`                             | Run sub-agent with configurable forwarding       |

**RunSubAgentOptions**:

| Option                   | Type                       | Default | Description                              |
|--------------------------|----------------------------|---------|------------------------------------------|
| `agentType`              | `string`                   | -       | The type of agent to create              |
| `headless`               | `boolean`                  | -       | Whether to run in headless mode          |
| `input`                  | `InputMessage`             | -       | The command to send to the agent         |
| `parentAgent`            | `Agent`                    | -       | The parent agent instance                |
| `background`             | `boolean`                  | false   | Run in background and return immediately |
| `options`                | `Partial<ParsedSubAgentConfig>` | {}    | Configuration options for sub-agent      |
| `autoCleanup`            | `boolean`                  | true    | Auto-delete child agent when done        |
| `checkPermissions`       | `boolean`                  | true    | Check parent agent permissions           |

**RunSubAgentResult**:

```typescript
interface RunSubAgentResult {
  status: "success" | "error" | "cancelled";
  response: string;
  childAgent?: Agent; // Only if autoCleanup is false
}
```

## Usage Examples

### Basic Agent Creation and Usage

```typescript
import Agent from "@tokenring-ai/agent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import TokenRingApp from "@tokenring-ai/app";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";

const app = new TokenRingApp();

// Create agent manager and add configurations
const agentManager = new AgentManager(app);
agentManager.addAgentConfigs({
  agentType: "myAgent",
  displayName: "My Agent",
  description: "Custom development agent",
  category: "development",
  debug: false,
  initialCommands: [],
  headless: false,
  callable: true,
  idleTimeout: 0,
  maxRunTime: 0,
  minimumRunning: 0,
  subAgent: {},
  allowedSubAgents: [],
  todos: {},
  createMessage: "Agent Created"
});

// Spawn agent
const agent = await agentManager.spawnAgent({
  agentType: "myAgent",
  headless: false
});

// Handle user input
const requestId = agent.handleInput({from: "user", message: "Hello! How can you help me?"});

// Listen to events
for await (const state of agent.subscribeStateAsync(AgentEventState, agent.agentShutdownSignal)) {
  for (const event of state.events) {
    console.log("Event:", event.type, event);
  }
}
```

### Agent Command Registration

Agents can be automatically registered as callable commands, allowing users to invoke them directly using a simple slash
command syntax. This provides a more intuitive interface than using `/agent run <type> <message>`.

```typescript
// Register agent as a command
agentManager.addAgentConfigs({
  agentType: "researcher",
  displayName: "Researcher Agent",
  description: "Researches topics and provides summaries",
  category: "research",
  command: {
    enabled: true,                    // Enable command registration (default: true when command is provided)
    name: "research",                 // Custom command name (defaults to agentType)
    description: "Research a topic",  // Custom description (defaults to agent description)
    help: `# /research

## Description
Research a topic and provide a comprehensive summary.

## Usage
/research <topic>

## Examples
/research artificial intelligence
/research quantum computing`,        // Custom help text
    background: false,                // Run in background (default: false)
    forwardChatOutput: true,          // Forward chat output (default: true)
    forwardSystemOutput: true,        // Forward system output (default: true)
    forwardHumanRequests: true,       // Forward human requests (default: true)
    forwardReasoning: false,          // Forward reasoning (default: false)
    forwardInputCommands: true,       // Forward input commands (default: true)
    forwardArtifacts: false,          // Forward artifacts (default: false)
  },
  // ... other config options
});

// Now users can invoke the agent with:
// /research artificial intelligence
// Instead of:
// /agent run researcher artificial intelligence
```

**Command Configuration Options:**

| Option                 | Type      | Default           | Description                                           |
|------------------------|-----------|-------------------|-------------------------------------------------------|
| `name`                 | `string`  | agentType         | Custom command name                                   |
| `description`          | `string`  | agent description | Command description shown in help                     |
| `help`                 | `string`  | -                 | Custom help text for the command (markdown supported) |
| `background`           | `boolean` | false             | Run the agent in background mode                      |
| `forwardChatOutput`    | `boolean` | true              | Forward chat output to parent                         |
| `forwardSystemOutput`  | `boolean` | true              | Forward system output to parent                       |
| `forwardHumanRequests` | `boolean` | true              | Forward human input requests to parent                |
| `forwardReasoning`     | `boolean` | false             | Forward reasoning output to parent                    |
| `forwardInputCommands` | `boolean` | true              | Forward input commands to parent                      |
| `forwardArtifacts`     | `boolean` | false             | Forward artifacts to parent                           |

**Simple Example:**

```typescript
// Minimal configuration - uses defaults
agentManager.addAgentConfigs({
  agentType: "translator",
  displayName: "Translator",
  description: "Translates text between languages",
  category: "utility",
  command: {},  // Just enable with defaults
  // ... other config
});

// Users can now use:
// /translator Hello, how are you?
```

### State Management and Checkpointing

```typescript
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {CommandHistoryState} from "@tokenring-ai/agent/state/commandHistoryState";
import {TodoState} from "@tokenring-ai/agent/state/todoState";
import {SubAgentState} from "@tokenring-ai/agent/state/subAgentState";

// State slices are automatically initialized by Agent
// Access them via getState/mutateState:

// Get event state
const eventState = agent.getState(AgentEventState);
console.log("Events:", eventState.events);

// Modify command history
agent.mutateState(CommandHistoryState, (state) => {
  state.commands.push("new command");
});

// View todo state
const todoState = agent.getState(TodoState);
console.log("Todos:", todoState.todos);

// Create checkpoint
const checkpoint = agent.generateCheckpoint();
console.log("Checkpoint:", checkpoint);

// Restore from checkpoint (via AgentManager)
const restoredAgent = await agentManager.spawnAgentFromCheckpoint(checkpoint, {});
```

### Sub-Agent Creation

```typescript
// Create sub-agent from parent
const subAgent = await agentManager.spawnSubAgent(agent, "backgroundWorker", {
  headless: true
});

// Send message to sub-agent
await subAgent.handleInput({from: "parent", message: "Process this data"});

// Sub-agent state is automatically copied from parent (if configured)
await agentManager.deleteAgent(subAgent.id, "Cleanup");
```

**Note**: Sub-agent permissions are managed by `SubAgentService`. The `allowedSubAgents` config is resolved from wildcard patterns to actual agent types during agent attachment.

### Using SubAgentService Directly

For more advanced sub-agent execution with fine-grained control:

```typescript
import SubAgentService from "@tokenring-ai/agent/services/SubAgentService";

const subAgentService = agent.getServiceByType(SubAgentService);

// Run sub-agent with custom forwarding options
const result = await subAgentService.runSubAgent({
  agentType: "code-assistant",
  headless: true,
  input: {
    from: "parent",
    message: "/work Analyze this code: function test() { return true; }"
  },
  parentAgent: agent,
  options: {
    forwardChatOutput: true,
    forwardSystemOutput: true,
    forwardReasoning: false,
    forwardHumanRequests: true,
    forwardInputCommands: true,
    forwardArtifacts: false,
    timeout: 60,
    maxResponseLength: 500,
    minContextLength: 300
  },
  autoCleanup: true,
  checkPermissions: true,
});

console.log("Result:", result.status, result.response);
```

### Human Interface Requests

```typescript
// Simple approval (Yes/No)
const approved = await agent.askForApproval({
  message: "Are you sure you want to proceed?",
  label: "Approve?",
  default: false,
  autoSubmitAfter: 30000 // Auto-approve after 30 seconds
});

// Text input
const text = await agent.askForText({
  message: "Enter your name:",
  label: "Name",
  masked: false
});

// Single tree selection
const selection = await agent.askQuestion({
  message: "Choose an option",
  question: {
    type: 'treeSelect',
    label: 'Select',
    minimumSelections: 1,
    maximumSelections: 1,
    defaultValue: [],
    tree: [
      {
        name: "Option 1",
        value: "opt1"
      },
      {
        name: "Option 2",
        value: "opt2"
      }
    ]
  }
});

// Complex form
const formData = await agent.askQuestion({
  message: "Fill out the contact form",
  question: {
    type: 'form',
    sections: [
      {
        name: "personal",
        description: "Personal Information",
        fields: {
          name: {
            type: 'text',
            label: 'Full Name',
            defaultValue: ''
          },
          email: {
            type: 'text',
            label: 'Email',
            defaultValue: ''
          }
        }
      },
      {
        name: "preferences",
        description: "Preferences",
        fields: {
          category: {
            type: 'treeSelect',
            label: 'Category',
            defaultValue: [],
            tree: [
              {
                name: "Support",
                value: "support"
              },
              {
                name: "Sales",
                value: "sales"
              }
            ]
          }
        }
      }
    ]
  }
});

// Handle human response
agent.sendInteractionResponse({
  requestId,
  interactionId,
  result: selection
});
```

### Output Artifacts

```typescript
// Emit an artifact (e.g., markdown file)
agent.artifactOutput({
  name: "report.md",
  encoding: "text",
  mimeType: "text/markdown",
  body: `# Report

Generated content...`
});

// Emit binary artifact
agent.artifactOutput({
  name: "image.png",
  encoding: "base64",
  mimeType: "image/png",
  body: "base64_encoded_data..."
});
```

### Status Line Management

```typescript
// Set current activity
agent.setCurrentActivity("Processing request...");

// Use busyWithActivity for temporary status
const result = await agent.busyWithActivity("Processing data...", async () => {
  // Your async operation here
  return await processData();
});
```

## Configuration

### AgentConfig Schema

```typescript
import {AgentConfigSchema} from "@tokenring-ai/agent/schema";

// AgentConfig is the input type (z.input<typeof AgentConfigSchema>)
// ParsedAgentConfig is the output type (z.output<typeof AgentConfigSchema>)

const agentConfig = {
  agentType: string,               // Agent type identifier (required)
  displayName: string,             // Agent display name (required)
  description: string,             // Agent purpose (required)
  category: string,                // Agent category (required)
  debug: boolean,                  // Enable debug logging (default: false)
  workHandler: Function,           // Custom work handler (optional)
  initialCommands: string[],       // Startup commands (default: [])
  createMessage: string,           // Message displayed when agent is created (default: "Agent Created")
  headless: boolean,               // Headless mode (default: false)
  callable: boolean,               // Enable tool calls (default: true)
  command: {                       // Register this agent as a callable command (optional)
    name?: string,                 // Custom command name (defaults to agentType)
    description?: string,          // Custom command description (defaults to agent description)
    help?: string,                 // Custom help text for the command
    background?: boolean,          // Run in background mode (default: false)
    forwardChatOutput?: boolean,   // Forward chat output (default: true)
    forwardSystemOutput?: boolean, // Forward system output (default: true)
    forwardHumanRequests?: boolean,// Forward human requests (default: true)
    forwardReasoning?: boolean,    // Forward reasoning (default: false)
    forwardInputCommands?: boolean,// Forward input commands (default: true)
    forwardArtifacts?: boolean,    // Forward artifacts (default: false)
  },
  minimumRunning: number,          // Minimum running agents of this type (default: 0)
  idleTimeout: number,             // Idle timeout in seconds (default: 0 = no limit)
  maxRunTime: number,              // Max runtime in seconds (default: 0 = no limit)
  subAgent: {                      // Sub-agent configuration
    forwardChatOutput?: boolean,   // Forward chat output (default: false)
    forwardStatusMessages?: boolean,// Forward status messages (default: true)
    forwardSystemOutput?: boolean, // Forward system output (default: false)
    forwardHumanRequests?: boolean,// Forward human requests (default: true)
    forwardReasoning?: boolean,    // Forward reasoning (default: false)
    forwardInputCommands?: boolean,// Forward input commands (default: true)
    forwardArtifacts?: boolean,    // Forward artifacts (default: false)
    timeout?: number,              // Sub-agent timeout in seconds (default: 0)
    maxResponseLength?: number,    // Max response length in characters (default: 10000)
    minContextLength?: number,     // Minimum context length in characters (default: 1000)
  },
  allowedSubAgents: string[],      // Allowed sub-agent types (default: [])
  todos: {                         // Todo list configuration
    copyToChild: boolean,          // Copy todos to child agents (default: true)
    initialItems: Array<{          // Initial todo items (default: [])
      id: string,
      content: string,
      status: "pending" | "in_progress" | "completed"
    }>
  }
};
```

### AgentPackageConfig Schema

```typescript
import {AgentPackageConfigSchema} from "@tokenring-ai/agent/schema";

// Allows defining multiple agent configurations in app config
const config = {
  agents: {
    app: [
      {
        agentType: "teamLeader",
        displayName: "Team Leader",
        description: "Coordinates development tasks",
        category: "development",
        // ... other config
      }
    ],
    user: [
      {
        agentType: "researcher",
        displayName: "Researcher",
        description: "Researches topics",
        category: "research",
        // ... other config
      }
    ]
  }
};
```

## Event System

### Event Types

**Input Events:**

- `input.received` - Input received from user
- `input.interaction` - User interaction response

**Output Events:**

- `output.chat` - Chat output
- `output.reasoning` - Reasoning output
- `output.info` - Informational messages
- `output.warning` - Warning messages
- `output.error` - Error messages
- `output.artifact` - Output artifact (files, documents, etc.)

**State Events:**

- `agent.execution` - Agent execution state update
- `agent.created` - Agent was created
- `agent.stopped` - Agent was stopped

**Control Events:**

- `cancel` - Operation cancelled
- `input.execution` - Input execution status update

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
    app: [
      {
        agentType: "myAgent",
        displayName: "My Agent",
        description: "Custom agent",
        category: "development",
        debug: false,
        initialCommands: [],
        headless: false,
        callable: true,
        idleTimeout: 0,
        maxRunTime: 0,
        minimumRunning: 0,
        subAgent: {},
        allowedSubAgents: [],
        todos: {},
        createMessage: "Agent Created"
      }
    ]
  }
};
```

## Integration

### TokenRing Plugin Integration

The agent package automatically integrates with TokenRing applications:

```typescript
// Plugin automatically registers:
// - Chat service integration (tools, context handlers)
// - Agent command service
// - Agent manager service
// - Web host RPC endpoints
// - Context handlers
// - Tools and commands
```

### Chat Commands

The agent package includes built-in chat commands:

- `/agent` - Agent management commands
- `/help` - Help system
- `/hooks` - Hook management
- `/settings` - Settings display
- `/work` - Work handler invocation
- `/debug` - Debug commands

### Tools

The agent package includes built-in tools:

- `runAgent` - Execute sub-agent
- `todo` - Todo list management
- `getCurrentDatetime` - Get current date/time

### Context Handlers

- `available-agents` - Provides list of available agent types
- `todo-list` - Provides todo list context

### RPC Endpoints

| Endpoint                    | Type     | Request Params                                          | Response                              |
|-----------------------------|----------|---------------------------------------------------------|---------------------------------------|
| `getAgent`                  | query    | `{agentId}`                                             | Agent details                         |
| `getAgentEvents`            | query    | `{agentId, fromPosition}`                               | Events from position                  |
| `streamAgentEvents`         | stream   | `{agentId, fromPosition}`                               | Streaming events                      |
| `listAgents`                | query    | `{}`                                                    | Array of agent information            |
| `getAgentTypes`             | query    | `{}`                                                    | Array of agent types                  |
| `createAgent`               | mutation | `{agentType, headless}`                                 | Created agent details                 |
| `deleteAgent`               | mutation | `{agentId, reason}`                                     | Success status                        |
| `sendInput`                 | mutation | `{agentId, input: {from, message, attachments?}}`       | Request ID                            |
| `sendInteractionResponse`   | mutation | `{agentId, response: {requestId, interactionId, result}}` | Success status                      |
| `abortCurrentOperation`     | mutation | `{agentId, message}`                                    | Success status                        |
| `getCommandHistory`         | query    | `{agentId}`                                             | Command history                       |
| `getAvailableCommands`      | query    | `{agentId}`                                             | Available command names               |
| `getAvailableSubAgents`     | query    | `{agentId}`                                             | Array of available sub-agent types    |
| `getEnabledSubAgents`       | query    | `{agentId}`                                             | Array of enabled sub-agent types      |
| `enableSubAgents`           | mutation | `{agentId, agents: string[]}`                           | Success status                        |
| `disableSubAgents`          | mutation | `{agentId, agents: string[]}`                           | Success status                        |

## State Management

### State Slices

Agents support multiple state slices for different concerns:

**Built-in State Slices:**

| State Slice           | Description                          |
|-----------------------|--------------------------------------|
| `AgentEventState`     | Event history and current state      |
| `CommandHistoryState` | Command execution history            |
| `TodoState`           | Task list management                 |
| `SubAgentState`       | Sub-agent configuration              |

**AgentEventState:**

- `events`: Array of AgentEventEnvelope
- `inputQueue`: Array of input queue items
- `currentlyExecutingInputItem`: Currently executing input item or null
- `getEventCursorFromCurrentPosition()`: Get event cursor
- `yieldEventsByCursor(cursor)`: Yield events by cursor
- `idle`: Computed property (inputQueue.length === 0)

**AgentExecutionState (in AgentEventState):**

- `status`: Execution status (queued, running, finished)
- `currentActivity`: Current activity description
- `availableInteractions`: Array of available interactions

**CommandHistoryState:**

- `commands`: Array of command strings

**TodoState**:

- `todos`: Array of TodoItem
- `transferStateFromParent(parentAgent)`: Copy todos from parent (if `todos.copyToChild` is enabled)
- Constructor accepts `ParsedAgentConfig` to initialize with todo configuration

**SubAgentState:**

- `allowedSubAgents`: Array of allowed sub-agent types

**Custom State Slices:**

```typescript
import {AgentStateSlice} from "@tokenring-ai/agent/types";
import {z} from "zod";

const serializationSchema = z.object({
  data: z.array(z.string()).default([])
});

class CustomState extends AgentStateSlice<typeof serializationSchema> {
  readonly name = "CustomState";
  serializationSchema = serializationSchema;
  data: string[] = [];

  reset(what: ResetWhat[]) {
    if (what.includes("chat")) {
      this.data = [];
    }
  }

  show(): string[] {
    return [`Data items: ${this.data.length}`];
  }

  serialize() {
    return {data: this.data};
  }

  deserialize(obj: any) {
    this.data = obj.data || [];
  }
}
```

### Checkpointing

```typescript
// Generate checkpoint
const checkpoint = agent.generateCheckpoint();

// Restore from checkpoint
const restoredAgent = await agentManager.spawnAgentFromCheckpoint(checkpoint, {});
```

### ResetWhat Types

The reset operation supports multiple target types:

```typescript
// ResetWhat is z.enum(["context", "chat", "history", "settings", "memory", "costs"])
```

## Human Interface Types

### Question Types

The agent supports several question types for human interaction:

**Text Question:**

```typescript
{
  type: 'text',
  label: 'Name',
  description: 'Enter your name',
  required: false,
  defaultValue: '',
  expectedLines: 1,
  masked: false,
  autoSubmitAfter: number
}
```

**Tree Select Question:**

```typescript
{
  type: "treeSelect",
  label: 'Choose an option',
  minimumSelections: 1,
  maximumSelections: 1,
  defaultValue: [],
  allowFreeform: false,
  tree: [
    {
      name: "Option 1",
      value: "opt1",
      children: [...]
    }
  ]
}
```

**File Select Question:**

```typescript
{
  type: 'fileSelect',
  allowFiles: true,
  allowDirectories: true,
  label: 'Select files',
  description: 'Choose files or folders',
  minimumSelections: 1,
  maximumSelections: 5,
  defaultValue: []
}
```

**Form Question:**

```typescript
{
  type: 'form',
  sections: [
    {
      name: "personal",
      description: "Personal Information",
      fields: {
        name: {type: 'text', label: 'Full Name', defaultValue: ''},
        email: {type: 'text', label: 'Email', defaultValue: ''}
      }
    }
  ]
}
```

### Tree Leaf Structure

```typescript
{
  name: string,
  value?: string,
  children?: Array<TreeLeaf>
}
```

## Error Handling

### CommandFailedError

The agent package throws `CommandFailedError` when command execution fails:

```typescript
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";

try {
  await agent.runCommand("/unknown-command");
} catch (error) {
  if (error instanceof CommandFailedError) {
    console.log("Command failed:", error.message);
  }
}
```

## Development

### Testing

```bash
bun run test
bun run test:watch
bun run test:coverage
```

### Plugin Development

Create custom plugins for agent functionality:

```typescript
import {TokenRingPlugin} from "@tokenring-ai/app";

const myAgentPlugin: TokenRingPlugin = {
  name: "my-plugin",
  install(app, config) {
    // Register custom commands
    // Register custom tools
    // Register custom hooks
    // Register custom state slices
  },
  config: myConfigSchema // Optional
};
```

### Package Structure

```
pkg/agent/
├── Agent.ts                          # Core Agent class implementation
├── AgentEvents.ts                    # Event type definitions and schemas
├── AgentError.ts                     # Error class definitions
├── types.ts                          # Core type definitions
├── schema.ts                         # Agent configuration schema
├── question.ts                       # Question type definitions and schemas
├── index.ts                          # Package exports
├── plugin.ts                         # TokenRing plugin integration
├── package.json                      # Package configuration
├── commands.ts                       # Built-in command exports
├── tools.ts                          # Tool exports
├── contextHandlers.ts                # Context handler exports
├── hooks.ts                          # Lifecycle hook definitions
├── commands/                         # Built-in commands
│   ├── agent/
│   │   ├── types.ts                  # Agent types command
│   │   ├── list.ts                   # Agent list command
│   │   ├── run.ts                    # Agent run command
│   │   └── shutdown.ts               # Agent shutdown command
│   ├── debug/
│   │   ├── logging.ts                # Debug logging controls
│   │   ├── markdown.ts               # Markdown rendering test
│   │   ├── services.ts               # Service logs display
│   │   ├── questions.ts              # Debug questions display
│   │   ├── checkpoint.ts             # Debug checkpoint test
│   │   └── app.ts                    # Debug app info
│   ├── cost.ts                       # Cost tracking commands
│   ├── work.ts                       # Work handler invocation
│   ├── settings.ts                   # Settings display
│   └── help.ts                       # Help system
├── services/                         # Core services
│   ├── AgentManager.ts               # Agent management service
│   ├── AgentCommandService.ts        # Command execution service
│   └── SubAgentService.ts            # Sub-agent execution service
├── state/                            # State management
│   ├── agentEventState.ts            # Event state management
│   ├── commandHistoryState.ts        # Command history tracking
│   ├── todoState.ts                  # Todo state management
│   └── subAgentState.ts              # Sub-agent configuration state
├── tools/                            # Built-in tools
│   ├── runAgent.ts                   # Sub-agent execution tool
│   ├── todo.ts                       # Todo list management tool
│   └── getCurrentDatetime.ts         # Get current date/time tool
├── contextHandlers/                  # Context providers
│   ├── availableAgents.ts            # Available agents context
│   └── todo.ts                       # Todo context provider
├── rpc/                              # RPC endpoints
│   ├── agent.ts                      # Agent RPC implementation
│   └── schema.ts                     # RPC schema definitions
├── util/                             # Utilities
│   ├── formatAgentCommandUsage.ts    # Command usage formatting
│   ├── formatAgentId.ts              # Agent ID formatting
│   ├── parseAgentCommandInput.ts     # Command input parsing
│   └── todo.ts                       # Todo utilities
└── test/                             # Test files
    └── unit/
        ├── commands/
        │   ├── help.test.ts
        │   └── work.test.ts
        ├── agent.test.ts
        ├── AgentCommandService.test.ts
        ├── AgentLifecycleService.test.ts
        └── AgentManager.test.ts
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
