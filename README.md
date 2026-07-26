# @tokenring-ai/agent

## Overview

The core agent orchestration system for TokenRing AI, enabling creation and management of AI agents with comprehensive state management, event handling, command execution, tool integration, and lifecycle management. This package provides a complete agent framework that integrates seamlessly with the TokenRing ecosystem.

## Key Features

- **Agent Management**: Create, spawn, and manage individual AI agents with configurable lifecycles
- **State Management**: Persistent state with serialization, checkpointing, and restoration via `StateManager`
- **Event System**: Comprehensive event handling with streaming capabilities via `AgentEventState`
- **Command System**: Slash command interface with extensible commands and automatic registration via `AgentCommandService`
- **Tool Integration**: Tool execution with context and parameter validation
- **Human Interface**: Request/response system for human interaction with multiple question types (text, treeSelect, fileSelect, form)
- **Sub-Agent Support**: Create and manage child agents with configurable output forwarding via `SubAgentService`
- **RPC Integration**: JSON-RPC endpoints for remote agent management
- **Plugin Integration**: Automatic integration with TokenRing applications
- **Idle/Max Runtime Management**: Automatic cleanup of idle or long-running agents
- **Minimum Agent Count**: Maintain minimum number of agents per type
- **Abort Handling**: Graceful abort handling with cleanup

## Installation

```bash
bun add @tokenring-ai/agent
```

## Dependencies

- `@tokenring-ai/chat` - Chat service integration
- `@tokenring-ai/utility` - Shared utilities
- `@tokenring-ai/app` - Base application framework with `TokenRingApp` and `StateManager`
- `@tokenring-ai/lifecycle` - Lifecycle hooks integration
- `@tokenring-ai/rpc` - RPC service integration
- `uuid` - Unique ID generation
- `zod` - Schema validation

## Dev Dependencies

- `typescript` - TypeScript language support

## Package Exports

The package exports the following from `index.ts`:

```typescript
// Main exports
import { Agent } from "@tokenring-ai/agent";
import { AgentManager } from "@tokenring-ai/agent";
import { AgentCommandService } from "@tokenring-ai/agent";
import { SubAgentService } from "@tokenring-ai/agent";

// Lifecycle hooks
import { AfterInputReceived } from "@tokenring-ai/agent";

// Type exports
import type { RunSubAgentOptions, RunSubAgentResult } from "@tokenring-ai/agent";
```

### Additional Exports by Path

```typescript
// State exports
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import { CommandHistoryState } from "@tokenring-ai/agent/state/commandHistoryState";

// Schema exports
import { AgentConfigSchema, AgentPackageConfigSchema, SubAgentConfigSchema } from "@tokenring-ai/agent/schema";

// Type exports
import type { AgentCheckpointData, TokenRingAgentCommand, AgentStateSlice } from "@tokenring-ai/agent/types";
import type { RunSubAgentOptions, RunSubAgentResult } from "@tokenring-ai/agent/services/SubAgentService";

// Event exports
import {
  AgentEventEnvelopeSchema,
  InputMessageSchema,
  InteractionResponseSchema,
  ToolCallResultSchema,
} from "@tokenring-ai/agent/AgentEvents";

// Question exports
import { QuestionSchema, TextQuestionSchema, TreeSelectQuestionSchema } from "@tokenring-ai/agent/question";

// Error exports
import { CommandFailedError } from "@tokenring-ai/agent/AgentError";

// Commands and tools
import agentCommands from "@tokenring-ai/agent/commands";
import agentTools from "@tokenring-ai/agent/tools";
```

## Core Components

### Agent Class

The central agent implementation providing comprehensive AI agent functionality:

```typescript
import { Agent } from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import type { ParsedAgentConfig } from "@tokenring-ai/agent/schema";

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
  idleTimeout: 0,
  maxRunTime: 0,
  minimumRunning: 0,
  createMessage: "Agent Created"
};

const shutdownController = new AbortController();
const agent = new Agent(app, {}, config, shutdownController.signal);
```

**Key Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique agent identifier (human-readable ID) |
| `createdAt` | `number` | Timestamp when the agent was created |
| `displayName` | `string` | Agent display name from config |
| `config` | `ParsedAgentConfig` | Parsed agent configuration |
| `debugEnabled` | `boolean` | Debug logging toggle |
| `headless` | `boolean` | Headless operation mode (from config) |
| `app` | `TokenRingApp` | TokenRing application instance |
| `stateManager` | `StateManager` | State management system |
| `agentShutdownSignal` | `AbortSignal` | Agent shutdown signal |

**State Management Methods:**

| Method | Description |
|--------|-------------|
| `initializeState<T>(ClassType, props)` | Initialize state slice with properties |
| `getState<T>(ClassType)` | Retrieve state slice |
| `mutateState<T>(ClassType, callback)` | Modify state slice with callback |
| `subscribeState<T>(ClassType, callback)` | Subscribe to state changes |
| `waitForState<T>(ClassType, predicate)` | Wait for state condition |
| `subscribeStateAsync<T>(ClassType)` | Subscribe asynchronously with async iterator |
| `generateCheckpoint()` | Create state checkpoint for restoration |
| `restoreState(state)` | Restore from checkpoint state |

**Input Processing:**

| Method | Description |
|--------|-------------|
| `handleInput({message, attachments})` | Process user input with event emission, returns requestId |
| `runCommand(command)` | Execute agent commands via `AgentCommandService` |
| `busyWithActivity<T>(message, awaitable)` | Execute with busy state indicator |
| `setCurrentActivity(message)` | Set current activity indicator |
| `getAbortSignal()` | Get current abort signal (when executing) |

**Event Emission:**

| Method | Description |
|--------|-------------|
| `chatOutput(message)` | Emit chat output event |
| `reasoningOutput(message)` | Emit reasoning output event |
| `infoMessage(...messages)` | Emit informational messages |
| `warningMessage(...messages)` | Emit warning messages |
| `errorMessage(...messages)` | Emit error messages |
| `debugMessage(...messages)` | Emit debug messages (if debug enabled) |
| `toolCallResult(result)` | Emit tool call result |

**Human Interface:**

| Method | Description |
|--------|-------------|
| `askForApproval({message, label, default, timeout})` | Request approval (Yes/No), returns `Promise<boolean \| null>` |
| `askForText({message, label, masked})` | Request text input, returns `Promise<string \| null>` |
| `askQuestion<T>(question)` | Request human input with various question types |
| `sendInteractionResponse(response)` | Send human response to interaction |
| `waitForInteraction(interaction)` | Wait for user interaction |

**Lifecycle Management:**

| Method | Description |
|--------|-------------|
| `abortCurrentOperation(reason)` | Abort current operation with reason |
| `getIdleDuration()` | Get time since last activity in milliseconds |
| `getRunDuration()` | Get total run duration in milliseconds |
| `runBackgroundTask(task)` | Run a background task with error handling |
| `getAgentConfigSlice<T>(key, schema)` | Get config value with validation |

**Checkpoint Creation:**

```typescript
const checkpoint = agent.generateCheckpoint();
// Returns: { agentId, createdAt, sessionId, agentType, state }
```

### AgentManager Service

Central service for managing agent lifecycles and configurations:

```typescript
import { AgentManager } from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";

const app = new TokenRingApp();
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
  idleTimeout: 0,
  maxRunTime: 0,
  minimumRunning: 0,
  createMessage: "Agent Created"
});

// Spawn agents
const agent = agentManager.spawnAgent({
  agentType: "myAgent",
  headless: false
});

// Spawn from config
const agent = agentManager.spawnAgentFromConfig(config);

// Spawn sub-agent
const subAgent = agentManager.spawnSubAgent(parentAgent, "workerAgent", {
  headless: true
});

// Get agents
const agent = agentManager.getAgent(agentId);
const allAgents = agentManager.getAgents();
const agentTypes = agentManager.getAgentTypes();

// Delete agent
agentManager.deleteAgent(agentId, "Reason for deletion");
```

**Key Methods:**

| Method | Description |
|--------|-------------|
| `addAgentConfigs(...configs)` | Register multiple agent configurations |
| `getAgentConfigEntries()` | Get all agent configuration entries |
| `getAgentConfig(name)` | Get specific agent configuration by name |
| `getAgentTypes()` | Get all available agent types |
| `getAgentTypesLike(pattern)` | Get agent types matching glob pattern |
| `spawnAgent({agentType, headless})` | Create new agent of specified type |
| `spawnSubAgent(agent, agentType, config)` | Create sub-agent with parent |
| `spawnAgentFromConfig(config)` | Create agent from configuration |
| `spawnAgentFromCheckpoint(checkpoint, config)` | Create agent from checkpoint |
| `getAgent(id)` | Get agent by ID, returns `Agent \| null` |
| `getAgents()` | Get all active agents |
| `deleteAgent(agentId, reason)` | Shutdown and remove agent |
| `subscribeAgentsAsync(signal)` | Async generator yielding agent list snapshots |

**Automatic Lifecycle Management:**

- Idle agent cleanup every 15 seconds (`cleanupCheckIntervalMs = 15000`)
- Configurable `idleTimeout` per agent (default: 0 = no limit, in seconds)
- Configurable `maxRunTime` per agent (default: 0 = no limit, in seconds)
- Configurable `minimumRunning` per agent type (default: 0 = no minimum)

### AgentCommandService Service

Service for managing and executing agent commands:

```typescript
import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingAgentCommand } from "@tokenring-ai/agent/types";

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
  execute: async ({ remainder, agent }) => {
    return `Processed: ${remainder}`;
  },
  help: "# /myCommand\n\nMy custom command help text"
});
```

**Command Processing:**

- Automatic slash command parsing
- Default chat command fallback (`/chat send`) for plain text
- Command singular/plural name handling
- Agent mention handling (`@agentName message` converts to `/agent run agentName message`)
- Error handling for unknown commands with suggestions
- Support for command attachments
- Command alias support via `alias` property

**Key Methods:**

| Method | Description |
|--------|-------------|
| `addAgentCommands(...commands)` | Register one or more commands |
| `getCommandNames()` | Get all command names |
| `getCommandEntries()` | Get all command entries |
| `getCommand(name)` | Get specific command by name |
| `executeAgentCommand(agent, message, attachments)` | Execute command |
| `runAgentLoop(agent, signal)` | Run the agent command processing loop |
| `attach(agent)` | Attach service to agent, starts command loop |

**Command Input Schema Types:**

```typescript
// Arguments schema
type AgentCommandArgumentSchema =
  | { type: "string"; description: string; required?: boolean; defaultValue?: string; minimum?: number; maximum?: number }
  | { type: "number"; description: string; required?: boolean; defaultValue?: number; minimum?: number; maximum?: number }
  | { type: "flag"; description: string }
  | { type: "date"; description: string; required?: boolean; defaultValue?: number };

// Positional schema
type AgentCommandPositionalSchema =
  | { name: string; description: string; required: true }
  | { name: string; description: string; required?: false; defaultValue?: string };

// Remainder schema
type AgentCommandRemainderSchema =
  | { name: string; description: string; required: true }
  | { name: string; description: string; required?: false; defaultValue?: string };

// Complete input schema
type AgentCommandInputSchema = {
  args?: AgentCommandArgumentSchema;
  positionals?: readonly AgentCommandPositionalSchema[];
  remainder?: AgentCommandRemainderSchema;
  allowAttachments?: boolean;
};
```

### SubAgentService Service

Service for managing sub-agent execution and permissions:

```typescript
import { SubAgentService } from "@tokenring-ai/agent";

const subAgentService = new SubAgentService(app);

// Run a sub-agent with forwarding options
const result = await subAgentService.runSubAgent({
  agentType: "worker",
  headless: true,
  from: "parent",
  steps: ["/work Process this data"],
  parentAgent: agent,
  options: {
    forwardChatOutput: true,
    forwardSystemOutput: true,
    forwardHumanRequests: true,
  },
  autoCleanup: true,
});

console.log(result.status, result.response);
```

**Key Methods:**

| Method | Description |
|--------|-------------|
| `runSubAgent(options)` | Run sub-agent with configurable forwarding |

**RunSubAgentOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agentType` | `string` | - | The type of agent to create |
| `headless` | `boolean` | - | Whether to run in headless mode |
| `from` | `string` | - | The source of the input |
| `steps` | `SubAgentStep[]` | - | The command(s) to send to the agent |
| `parentAgent` | `Agent` | - | The parent agent instance |
| `background` | `boolean` | `false` | Run in background and return immediately |
| `options` | `ParsedSubAgentConfig` | `{}` | Configuration options for sub-agent |
| `autoCleanup` | `boolean` | `true` | Auto-delete child agent when done |

**SubAgentStep:**

```typescript
type SubAgentStep = string | Pick<InputMessage, "message" | "attachments">;
```

**RunSubAgentResult:**

```typescript
interface RunSubAgentResult {
  status: "success" | "error" | "cancelled";
  response: string;
  childAgent?: Agent; // Only if autoCleanup is false
}
```

## Chat Commands

The agent package includes the following built-in chat commands:

| Command | Description |
|---------|-------------|
| `/agent list` | List all currently running agents |
| `/agent run` | Run an agent with a message |
| `/agent shutdown` | Shut down an agent |
| `/agent types` | List all available agent types |
| `/help` | Display help information |
| `/settings` | Display settings |
| `/debug app shutdown` | Send an abort command to the app |
| `/debug chat throwError` | Throw an error in the chat handler |
| `/debug checkpoint` | Debug checkpoint test |
| `/debug commands` | Debug commands display |
| `/debug logging` | Debug logging controls |
| `/debug markdown` | Markdown rendering test |
| `/debug questions` | Debug questions display |
| `/debug services` | Service logs display |

### `/agent run` Command Options

| Flag | Description |
|------|-------------|
| `--type` | The type of agent to run (required) |
| `--bg` | Run the agent in the background |
| `--forwardChatOutput` | Forward chat output from the sub-agent |
| `--noStatusMessages` | Do not forward status messages |
| `--forwardSystemOutput` | Forward system output from the sub-agent |
| `--noHumanRequests` | Do not forward human requests |
| `--forwardReasoning` | Forward reasoning output |
| `--noInputCommands` | Do not forward input commands |
| `--timeout` | Timeout in milliseconds for the sub-agent (0 = no timeout) |
| `--maxResponseLength` | Maximum response length from the sub-agent |
| `--minContextLength` | Minimum context length for the sub-agent |
| `--neverFail` | Ignore errors from the sub-agent, printing them as warnings instead |

**Examples:**

```bash
/agent run --type leader analyze the codebase
/agent run --bg --type researcher find information about AI
```

## Tools

The agent package includes the following built-in tools:

| Tool | Display Name | Description |
|------|--------------|-------------|
| `get_current_datetime` | Agent/Get Current Date & Time | Returns the current date, time, day of week, and timezone |
| `sleep` | Agent/Sleep | Sleeps for a specified number of seconds |
| `give_up` | Agent/Give Up | Indicates that the task cannot be completed |

### `get_current_datetime`

Returns the current date, time, day of week, and the user's local timezone. Use this tool any time you need to determine what date and time it is. Do not rely on your internal knowledge of what date and time it is, since that date and time is when you were trained, and is not reflective of the current date and time.

**Input Schema:**

```typescript
z.object({})
```

### `sleep`

Sleeps for a specified number of seconds, then returns the current date and time. Useful for introducing delays in agent workflows or waiting before performing actions.

**Input Schema:**

```typescript
z.object({
  seconds: z.number().int().positive()
})
```

### `give_up`

Call this tool when you are unable to complete the assigned task, or when the task violates your guidelines, or when you have encountered an unrecoverable error. Provide a clear explanation of why the work cannot be finished.

**Input Schema:**

```typescript
z.object({
  reason: z.string()
})
```

## Configuration

### AgentConfig Schema

```typescript
import { AgentConfigSchema } from "@tokenring-ai/agent/schema";

// AgentConfig is the input type (z.input<typeof AgentConfigSchema>)
// ParsedAgentConfig is the output type (z.output<typeof AgentConfigSchema>)

const agentConfig = {
  agentType: string,               // Agent type identifier (required)
  displayName: string,             // Agent display name (required)
  description: string,             // Agent purpose (required)
  category: string,                // Agent category (required)
  debug: boolean,                  // Enable debug logging (default: false)
  initialCommands: string[],       // Startup commands (default: [])
  createMessage: string,           // Message displayed when agent is created (default: "Agent Created")
  headless: boolean,               // Headless mode (default: false)
  idleTimeout: number,             // Idle timeout in seconds (default: 0 = no limit)
  maxRunTime: number,              // Max runtime in seconds (default: 0 = no limit)
  minimumRunning: number,          // Minimum running agents of this type (default: 0)
};
```

### AgentPackageConfig Schema

```typescript
import { AgentPackageConfigSchema } from "@tokenring-ai/agent/schema";

// Allows defining multiple agent configurations in app config
const config = {
  agents: {
    myAgent: {
      displayName: "My Agent",
      description: "Custom agent",
      category: "development",
      // ... other config
    }
  },
  commands: {} // Command configurations
};
```

### SubAgentConfig Schema

```typescript
import { SubAgentConfigSchema } from "@tokenring-ai/agent/schema";

const subAgentConfig = {
  forwardChatOutput: boolean,      // Forward chat outputs (default: false)
  forwardStatusMessages: boolean,  // Forward status messages (default: true)
  forwardSystemOutput: boolean,    // Forward system outputs (default: false)
  forwardHumanRequests: boolean,   // Forward human requests (default: true)
  forwardReasoning: boolean,       // Forward reasoning (default: false)
  forwardInputCommands: boolean,   // Forward input commands (default: true)
  timeout: number,                 // Sub-agent timeout in seconds (default: 0)
  maxResponseLength: number,       // Max response length in characters (default: 10000)
  minContextLength: number,        // Minimum context length in characters (default: 1000)
};
```

### AgentCommandConfig Schema

```typescript
import { AgentCommandConfigSchema } from "@tokenring-ai/agent/schema";

const commandConfig = {
  agentType: string,               // Type of agent to execute the command
  description: string,             // Custom command description
  commandSchema: {
    remainder: {
      name: string,                // Remainder parameter name
      description: string,         // Remainder description
      required: boolean            // Whether remainder is required
    }
  },
  help: string,                    // Custom help text
  background: boolean,             // Whether to run in background (default: false)
  requireNewAgent: boolean,        // Require new agent even if type matches (default: false)
  steps: string[],                 // Steps to execute (min 1)
  subAgent: SubAgentConfig         // Sub-agent configuration
};
```

## Event System

### Event Types

**Input Events:**

- `input.received` - Input received from user
- `input.interaction` - User interaction response
- `input.execution` - Input execution status update
- `cancel` - Input cancelled

**Output Events:**

- `output.chat` - Chat output
- `output.reasoning` - Reasoning output
- `output.info` - Informational messages
- `output.warning` - Warning messages
- `output.error` - Error messages

**State Events:**

- `agent.execution` - Agent execution state update
- `agent.created` - Agent was created
- `agent.stopped` - Agent was stopped
- `agent.status` - Agent status update

**Control Events:**

- `toolCall` - Tool call result

### Event Schema

All events follow this structure:

```typescript
import { AgentEventEnvelopeSchema } from "@tokenring-ai/agent/AgentEvents";

// Event envelope types:
// - AgentCreatedSchema
// - AgentStoppedSchema
// - AgentStatusSchema
// - AgentResponseSchema (discriminated by status: success/error/cancelled)
// - OutputChatSchema
// - OutputReasoningSchema
// - OutputInfoSchema
// - OutputWarningSchema
// - OutputErrorSchema
// - InputReceivedSchema
// - InputCancelSchema
// - InputExecutionStateSchema
// - InteractionResponseSchema
// - ToolCallResultSchema
```

## Lifecycle Hooks

### AfterInputReceived

Triggered after an input message is received by the agent. Used to process or react to incoming input before command execution begins.

```typescript
import { AfterInputReceived } from "@tokenring-ai/agent";

// Automatically executed by AgentCommandService when input is received
```

### AfterSubAgentResponse

Triggered after a sub-agent completes execution. Provides access to both the request options and the result.

```typescript
import { AfterSubAgentResponse } from "@tokenring-ai/agent/hooks";

// Automatically executed by /agent run command and createAgentCommand utility
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
      displayName: "My Agent",
      description: "Custom agent",
      category: "development",
      debug: false,
      initialCommands: [],
      headless: false,
      idleTimeout: 0,
      maxRunTime: 0,
      minimumRunning: 0,
      createMessage: "Agent Created"
    }
  },
  commands: {}
};
```

## RPC Endpoints

The package provides the following RPC endpoints via `/rpc/agent`:

| Endpoint | Type | Request Params | Response |
|----------|------|----------------|----------|
| `getAgentConfig` | query | `{agentId}` | Agent config or `agentNotFound` |
| `getAgentEvents` | query | `{agentId, fromPosition}` | Events from position |
| `streamAgentEvents` | stream | `{agentId, fromPosition}` | Streaming events |
| `listAgents` | query | `{}` | Array of agent information |
| `streamAgents` | stream | `{}` | Streaming agent list snapshots |
| `getAgentTypes` | query | `{}` | Array of agent types |
| `createAgent` | mutation | `{agentType, headless}` | Created agent details |
| `deleteAgent` | mutation | `{agentId, reason}` | Success status or `agentNotFound` |
| `sendInput` | mutation | `{agentId, input: {from, message, attachments?}}` | Request ID or `agentNotFound` |
| `sendInteractionResponse` | mutation | `{agentId, response: {requestId, interactionId, result}}` | Success status or `agentNotFound` |
| `abortCurrentOperation` | mutation | `{agentId, message}` | Success status or `agentNotFound` |
| `getCommandHistory` | query | `{agentId}` | Command history or `agentNotFound` |
| `getAvailableCommands` | query | `{agentId}` | Available command names or `agentNotFound` |

## State Management

### State Slices

Agents support multiple state slices for different concerns via `AgentStateSlice`:

**Built-in State Slices:**

| State Slice | Description |
|-------------|-------------|
| `AgentEventState` | Event history and current state |
| `CommandHistoryState` | Command execution history |

**AgentEventState:**

- `events`: Array of `AgentEventEnvelope`
- `inputQueue`: Array of `InputQueueItem`
- `currentlyExecutingInputItem`: Currently executing input item or null
- `status`: Execution status (`starting`, `running`, `shutdown`)
- `currentActivity`: Current activity description
- `idle`: Computed property (inputQueue.length === 0)
- `getEventCursorFromCurrentPosition()`: Get event cursor
- `yieldEventsByCursor(cursor)`: Yield events by cursor

**InputQueueItem:**

```typescript
type InputQueueItem = {
  request: ParsedInputReceived;
  executionState: {
    status: "queued" | "running" | "finished";
    currentActivity: string;
    availableInteractions: Interaction[];
  };
  interactionCallbacks: Map<string, (data: any) => void>;
  abortController: AbortController;
};
```

**CommandHistoryState:**

- `commands`: Array of command strings
- `reset()`: Clear command history
- `show()`: Display recent commands

**Custom State Slices:**

```typescript
import { AgentStateSlice } from "@tokenring-ai/agent/types";
import { z } from "zod";

const serializationSchema = z.object({
  data: z.array(z.string()).default([])
});

class CustomState extends AgentStateSlice<typeof serializationSchema> {
  readonly name = "CustomState";
  serializationSchema = serializationSchema;
  data: string[] = [];

  show(): string {
    return `Data items: ${this.data.length}`;
  }

  serialize() {
    return { data: this.data };
  }

  deserialize(obj: any) {
    this.data = obj.data || [];
  }

  transferStateFromParent(parentAgent: Agent) {
    // Optional: transfer state from parent agent
  }
}
```

### Checkpointing

```typescript
import { AgentCheckpointSchema } from "@tokenring-ai/agent/types";

// Generate checkpoint
const checkpoint = agent.generateCheckpoint();
// Returns: { agentId, sessionId, createdAt, agentType, state }

// Restore from checkpoint
const restoredAgent = agentManager.spawnAgentFromCheckpoint(checkpoint, {});
```

## Human Interface Types

### Question Types

The agent supports several question types for human interaction via `QuestionSchema`:

**Text Question:**

```typescript
{
  type: 'text',
  label: 'Name',
  description?: string,
  required?: boolean,
  defaultValue?: string,
  expectedLines?: number,
  masked?: boolean,
  autoSubmitAfter?: number
}
```

**Tree Select Question:**

```typescript
{
  type: "treeSelect",
  label: 'Choose an option',
  description?: string,
  minimumSelections?: number,
  maximumSelections?: number,
  defaultValue?: string[],
  allowFreeform?: boolean,
  tree: TreeLeaf[]
}
```

**File Select Question:**

```typescript
{
  type: 'fileSelect',
  allowFiles: boolean,
  allowDirectories: boolean,
  label: 'Select files',
  description?: string,
  minimumSelections?: number,
  maximumSelections?: number,
  defaultValue?: string[]
}
```

**Form Question:**

```typescript
{
  type: 'form',
  sections: FormSection[]
}

type FormSection = {
  name: string,
  description?: string,
  fields: Record<string, PrimitiveQuestions>
}
```

### Tree Leaf Structure

```typescript
type TreeLeaf =
  | { name: string; value: string }
  | { name: string; children: TreeLeaf[] };
```

**Helper Functions:**

```typescript
import { isTreeBranch, isTreeValueLeaf, getTreeNodeValue } from "@tokenring-ai/agent/question";

// Check node types
if (isTreeBranch(node)) {
  // Node has children
}

if (isTreeValueLeaf(node)) {
  // Node has a value
}

// Get the value of a tree node
const value = getTreeNodeValue(node);
```

## Utilities

### createAgentCommand

Registers an agent as a callable command. When `requireNewAgent` is false (default) and the invoking agent already has the same `agentType` as the command, steps run in-place via `/chat send`. Otherwise a new agent of the target type is spawned.

```typescript
import { createAgentCommand } from "@tokenring-ai/agent/util/createAgentCommand";
import type { ParsedAgentCommandConfig } from "@tokenring-ai/agent/schema";

const config: ParsedAgentCommandConfig = {
  agentType: "researcher",
  description: "Research a topic",
  commandSchema: {
    remainder: {
      name: "topic",
      description: "Topic to research",
      required: true,
    }
  },
  steps: ["Research {topic}"],
  subAgent: {
    forwardChatOutput: true,
  }
};

const command = createAgentCommand("research", config);
```

### formatAgentId

Formats agent ID consistently (8 characters):

```typescript
import { formatAgentId } from "@tokenring-ai/agent/util/formatAgentId";

const shortId = formatAgentId(agent.id); // "fancy-fox"
```

### projectAgentList

Projects agent instances into a serializable list format:

```typescript
import { projectAgentList } from "@tokenring-ai/agent/services/projectAgentList";
import type { AgentListEntry } from "@tokenring-ai/agent/services/projectAgentList";

const entries: AgentListEntry[] = projectAgentList(agents);
// Each entry: { id, createdAt, agentType, displayName, description, idle, currentActivity }
```

### createAgentStateSliceStream

Creates an async generator for streaming agent state slices over RPC:

```typescript
import { createAgentStateSliceStream } from "@tokenring-ai/agent/rpc/createAgentStateStream";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";

const stream = createAgentStateSliceStream({
  SliceClass: AgentEventState,
  project: (state, agent) => ({ events: state.events.length }),
});
```

## Error Handling

### CommandFailedError

The agent package throws `CommandFailedError` when command execution fails:

```typescript
import { CommandFailedError } from "@tokenring-ai/agent/AgentError";

try {
  await agent.runCommand("/unknown-command");
} catch (error) {
  if (error instanceof CommandFailedError) {
    console.log("Command failed:", error.message);
  }
}
```

## Usage Examples

### Basic Agent Creation and Usage

```typescript
import { Agent, AgentManager } from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";

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
  idleTimeout: 0,
  maxRunTime: 0,
  minimumRunning: 0,
  createMessage: "Agent Created"
});

// Spawn agent
const agent = agentManager.spawnAgent({
  agentType: "myAgent",
  headless: false
});

// Handle user input
const requestId = agent.handleInput({ from: "user", message: "Hello! How can you help me?" });

// Listen to events
for await (const state of agent.subscribeStateAsync(AgentEventState, agent.agentShutdownSignal)) {
  for (const event of state.events) {
    console.log("Event:", event.type, event);
  }
}
```

### State Management and Checkpointing

```typescript
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import { CommandHistoryState } from "@tokenring-ai/agent/state/commandHistoryState";

// State slices are automatically initialized by Agent
// Access them via getState/mutateState:

// Get event state
const eventState = agent.getState(AgentEventState);
console.log("Events:", eventState.events);

// Modify command history
agent.mutateState(CommandHistoryState, (state) => {
  state.commands.push("new command");
});

// Create checkpoint
const checkpoint = agent.generateCheckpoint();
console.log("Checkpoint:", checkpoint);

// Restore from checkpoint (via AgentManager)
const restoredAgent = agentManager.spawnAgentFromCheckpoint(checkpoint, {});
```

### Sub-Agent Creation

```typescript
// Create sub-agent from parent
const subAgent = agentManager.spawnSubAgent(agent, "backgroundWorker", {
  headless: true
});

// Send message to sub-agent
subAgent.handleInput({ from: "parent", message: "Process this data" });

// Sub-agent state is automatically copied from parent (if configured)
agentManager.deleteAgent(subAgent.id, "Cleanup");
```

### Using SubAgentService Directly

For more advanced sub-agent execution with fine-grained control:

```typescript
import { SubAgentService } from "@tokenring-ai/agent";

const subAgentService = agent.getServiceByType(SubAgentService);

// Run sub-agent with custom forwarding options
const result = await subAgentService.runSubAgent({
  agentType: "code-assistant",
  headless: true,
  from: "parent",
  steps: ["/work Analyze this code: function test() { return true; }"],
  parentAgent: agent,
  options: {
    forwardChatOutput: true,
    forwardSystemOutput: true,
    forwardReasoning: false,
    forwardHumanRequests: true,
    forwardInputCommands: true,
    timeout: 60,
    maxResponseLength: 500,
    minContextLength: 300
  },
  autoCleanup: true,
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
  timeout: 30000 // Auto-approve after 30 seconds
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

### Tool Call Results

```typescript
// Emit a tool call result event
agent.toolCallResult({
  name: "my_tool",
  args: { input: "test" },
  message: "**Tool** Executed my_tool",
  result: "Tool execution result",
  failed: false,
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

## Development

### Testing

```bash
bun run test
bun run test:watch
bun run test:coverage
```

### Package Structure

```text
plugin/agent/
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
├── hooks.ts                          # Lifecycle hook definitions
├── lifecycle.ts                      # Lifecycle event definitions
├── commands/                         # Built-in commands
│   ├── agent/
│   │   ├── types.ts                  # Agent types command
│   │   ├── list.ts                   # Agent list command
│   │   ├── run.ts                    # Agent run command
│   │   └── shutdown.ts               # Agent shutdown command
│   ├── debug/
│   │   ├── app.ts                    # Debug app shutdown
│   │   ├── chat.ts                   # Debug chat error throw
│   │   ├── logging.ts                # Debug logging controls
│   │   ├── markdown.ts               # Markdown rendering test
│   │   ├── services.ts               # Service logs display
│   │   ├── questions.ts              # Debug questions display
│   │   ├── checkpoint.ts             # Debug checkpoint test
│   │   └── commands.ts               # Debug commands display
│   ├── settings.ts                   # Settings display
│   └── help.ts                       # Help system
├── services/                         # Core services
│   ├── AgentManager.ts               # Agent management service
│   ├── AgentCommandService.ts        # Command execution service
│   ├── SubAgentService.ts            # Sub-agent execution service
│   └── projectAgentList.ts           # Agent list projection utility
├── state/                            # State management
│   ├── agentEventState.ts            # Event state management
│   └── commandHistoryState.ts        # Command history tracking
├── tools/                            # Built-in tools
│   ├── getCurrentDatetime.ts         # Get current date/time tool
│   ├── sleep.ts                      # Sleep tool
│   └── giveUp.ts                     # Give up tool
├── rpc/                              # RPC endpoints
│   ├── agent.ts                      # Agent RPC implementation
│   ├── schema.ts                     # RPC schema definitions
│   └── createAgentStateStream.ts     # State stream utility
├── util/                             # Utilities
│   ├── createAgentCommand.ts         # Agent command creation utility
│   ├── formatAgentCommandUsage.ts    # Command usage formatting
│   ├── formatAgentId.ts              # Agent ID formatting
│   └── parseAgentCommandInput.ts     # Command input parsing
└── test/                             # Test files
    ├── integration/
    │   └── agent-integration.test.ts
    └── unit/
        ├── commands/
        │   └── help.test.ts
        ├── AgentCommandService.test.ts
        ├── AgentLifecycleService.test.ts
        ├── AgentManager.test.ts
        ├── AgentManager.subscribeAgentsAsync.test.ts
        ├── agent.test.ts
        ├── createAgentCommand.test.ts
        ├── parseAgentCommandInput.test.ts
        └── streamAgents.rpc.test.ts
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
