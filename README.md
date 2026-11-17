# @tokenring-ai/agent

Central orchestrator for managing AI agents, commands, state persistence, and sub-agent execution within TokenRing applications.

## Overview

The agent package provides the core agent runtime for TokenRing: it defines the `Agent` class, the services that
manage agent lifecycles and dispatch slash commands, the state slices that track agent events and command history,
and the utilities that run sub-agents and build agent commands. It also exposes a JSON-RPC endpoint for remote agent
management and registers a debug snapshot source so running agents can be captured alongside app-level snapshots.

Agents are created through `AgentManager` from named agent type configurations ("agent types"). Each agent owns a
`StateManager` with two built-in state slices (`AgentEventState` for the event log and input queue, `CommandHistoryState`
for the commands that were entered). Input arrives through `Agent.handleInput`, which queues the message, runs the
`BeforeInputReceived` hook, and lets `AgentCommandService` dispatch it: slash commands are executed directly, plain text
is handed to the agent's `defaultCommand` (defaults to `/chat send`), and `@agentName` mentions route to `/agent run`.

### Key Features

- **Agent runtime**: the `Agent` class with event emission, state slices, checkpointing, human interaction, and abort handling
- **Agent management**: `AgentManager` registers agent type configs, spawns agents (from config, checkpoint, or as sub-agents), and runs automatic cleanup
- **Editable agents**: `AgentDirectoryService` keeps one YAML file per agent type in the workspace, so agents can be authored and edited outside configuration
- **Command system**: `AgentCommandService` registers and dispatches slash commands with a typed input schema (args, positionals, remainder, attachments)
- **Sub-agent execution**: `runSubAgent` runs a child agent and waits for it, with configurable output forwarding, timeouts, and auto-cleanup; `SubAgentService` runs sub-agents in the background and wakes the parent when they finish
- **Checkpointing and branching**: `generateCheckpoint` / `restoreState` plus the `/branch` command
- **Human interface**: text, tree select, file select, and form questions (`askForApproval`, `askForText`, `askQuestion`)
- **RPC integration**: `/rpc/agent` endpoint with 19 methods for remote agent management
- **Debug integration**: a debug snapshot source exposing every running agent to `DebugService`
- **Lifecycle hooks**: `BeforeInputReceived` (input mutation) and `AfterSubAgentResponse` (post sub-agent completion)

## Installation

```bash
bun add @tokenring-ai/agent
```

The plugin is normally installed through `PluginManager` together with the rest of the application plugins:

```typescript
import TokenRingApp from "@tokenring-ai/app";
import PluginManager from "@tokenring-ai/app/PluginManager";
import agentPlugin from "@tokenring-ai/agent/plugin";

const app = new TokenRingApp({
  app: {
    workingDirectory: "/path/to/project",
    workspaceDirectory: "/path/to/project",
    configDirectories: [],
  },
});

const pluginManager = app.addService(new PluginManager(app));
await pluginManager.installPlugins([agentPlugin]);
```

## Chat Commands

The agent plugin registers fifteen chat commands:

| Command | Description |
|---|---|
| `/settings` | Show current chat settings. |
| `/help` | Show this help message |
| `/branch` | Checkpoint the current agent and start a new agent from that checkpoint |
| `/agent types` | List all available agent types |
| `/agent list` | List all currently running agents |
| `/agent run` | Run an agent with a message |
| `/agent shutdown` | Shut down an agent |
| `/debug app shutdown` | Shut down the app; asks first unless `--confirm` is given |
| `/debug chat throwError` | Throw an error in the chat handler |
| `/debug logging` | Enable or disable debug logging |
| `/debug markdown` | Output a markdown sample |
| `/debug questions` | Test human interface request types |
| `/debug services` | Display service logs |
| `/debug checkpoint` | Dumps the current state of the agent to the chat window |
| `/debug commands` | Dumps a list of all the registered commands into the chat |

`/help <command>` shows the detailed help text for a single command. Text that does not start with `/` (including
text starting with `@`, such as a file mention) is prefixed with the agent's `defaultCommand` (`/chat send` by default).

### `/agent run` options

| Flag | Description |
|---|---|
| `--type` | The type of agent to run (required) |
| `--bg` | Run the agent in the background; its reply is sent to this agent when it finishes |
| `--forwardChatOutput` | Forward chat output from the sub-agent |
| `--noStatusMessages` | Do not forward status messages from the sub-agent |
| `--forwardSystemOutput` | Forward system output from the sub-agent |
| `--noHumanRequests` | Do not forward human requests from the sub-agent |
| `--forwardReasoning` | Forward reasoning output from the sub-agent |
| `--noInputCommands` | Do not forward input commands from the sub-agent |
| `--timeout` | Timeout in seconds for the sub-agent (0 = no timeout) |
| `--maxResponseLength` | Maximum response length from the sub-agent |
| `--minContextLength` | Minimum context length for the sub-agent |
| `--neverFail` | Ignore errors from the sub-agent, printing them as warnings instead of failing the command |

The trailing remainder is the message to send to the agent (required).

```bash
/agent run --type leader analyze the codebase
/agent run --bg --type researcher find information about AI
```

## Tools

This package does not define any tools.

## Scripting Functions

This package does not register any scripting functions.

## Configuration

The plugin's config schema is `AgentPackageConfigSchema`: `agents` and `commands` (both keyed by name, both defaulting
to `{}`), plus `agentDirectory`, which covers agent types authored in the workspace rather than in config.

```yaml
agentDirectory: agents
agents:
  researcher:
    displayName: Researcher
    description: Research topics and gather information
    category: Research
    defaultCommand: /chat send
    debug: false
    initialCommands: []
    createMessage: Agent Created
    minimumRunning: 0
    idleTimeout: 0
    maxRunTime: 0
commands:
  research:
    agentType: researcher
    description: Research a topic
    commandSchema:
      remainder:
        name: prompt
        description: Prompt to send to the agent
        required: true
    help: Research a topic with the researcher agent.
    background: false
    requireNewAgent: false
    steps:
      - "Research: {prompt}"
    subAgent:
      forwardChatOutput: false
      forwardStatusMessages: true
      forwardSystemOutput: false
      forwardHumanRequests: true
      forwardReasoning: false
      forwardInputCommands: true
      timeout: 0
      maxResponseLength: 10000
      minContextLength: 1000
```

### Agent types (`agents`)

Each key under `agents` is the agent type name; the value is an `AgentConfigSchema` with `agentType` removed (it comes
from the map key). The config is parsed with `.loose()`, so unknown fields on an agent type are ignored.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `displayName` | `string` | yes | — | Human-readable name shown in agent pickers |
| `description` | `string` | yes | — | What this agent type is for |
| `category` | `string` | yes | — | Group this agent type appears under in pickers |
| `defaultCommand` | `string` | no | `/chat send` | The default command to run when the message to the agent does not start with a `/` |
| `debug` | `boolean` | no | `false` | Log extra diagnostic output for this agent type |
| `initialCommands` | `string[]` | no | `[]` | Commands run automatically when an agent of this type starts |
| `createMessage` | `string` | no | `Agent Created` | Message logged when an agent of this type is created |
| `minimumRunning` | `number` | no | `0` | Keep at least this many agents of this type running |
| `idleTimeout` | `number` | no | `0` | Shut idle agents down after this long (0 disables) |
| `maxRunTime` | `number` | no | `0` | Hard limit on agent runtime (0 disables) |

`idleTimeout` and `maxRunTime` are measured in seconds (`unit: "s"`).

### Workspace agents (`agentDirectory`)

`agentDirectory` is resolved against the workspace directory (so it defaults to `.tokenring/agents`) and holds one YAML
file per agent type, named after the type: `<agentDirectory>/<agentType>.yaml`. The file body is an `AgentItemSchema` —
`AgentConfigSchema` without `agentType`, plus an optional `installedFrom` — and is `.loose()`, so plugin slices such as
`chat` and `filesystem` round-trip through disk untouched.

`AgentDirectoryService` owns these files (`listAgentDefinitions` / `getAgentDefinition` / `createAgentDefinition` /
`updateAgentDefinition` / `deleteAgentDefinition`) and registers them with `AgentManager` through
`setWorkspaceAgentConfigs`. That is a separate registry from the config-defined one: `reconfigure` reconciles only
config-defined types, so a configuration change cannot evict an agent that lives on disk. Where a type came from is
available as `AgentManager.getAgentSource(type)` — `"workspace"` for these, `"bundled"` for config-defined ones — and a
workspace agent shadows a bundled one of the same name.

In the Agents app, bundled agents are read-only and can only be cloned into the workspace; workspace agents can be
edited, cloned, and deleted.

| Field | Type | Default | Description |
|---|---|---|---|
| `agentDirectory` | `string` | `agents` | Directory (relative to the workspace) where editable agent YAML files are stored |

### Agent commands (`commands`)

Each key under `commands` is the command name; the value is an `AgentCommandConfigSchema`. A config-defined command is
turned into a callable `TokenRingAgentCommand` via `createAgentCommand` (see Utilities).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `agentType` | `string` | yes | — | Type of agent used to execute the tool |
| `description` | `string` | yes | — | Custom command description (defaults to agent description if not provided) |
| `commandSchema` | `object` | no | `{}` | Command input schema |
| `commandSchema.remainder` | `object` | no | `{ name: "prompt" }` | Remainder parameter definition |
| `remainder.name` | `string` | no | `prompt` | Remainder parameter name |
| `remainder.description` | `string` | no | `Prompt to send to the agent` | Remainder parameter description |
| `remainder.required` | `boolean` | no | `true` | Whether the remainder is required |
| `help` | `string` | no | — | Custom help text for the command |
| `background` | `boolean` | no | `false` | Whether to run in background mode by default |
| `requireNewAgent` | `boolean` | no | `false` | When false and the current agent already has the command's `agentType`, steps run in the foreground on the current agent; when true, a new agent of the target type is used |
| `steps` | `string[]` | yes | — | The steps to execute (min 1). `{<remainder.name>}` is interpolated with the command remainder |
| `subAgent` | `object` | no | `SubAgentConfigSchema` defaults | The subagent configuration |

On install, `AgentCommandService.reconfigure` validates that `agentType` exists in `AgentManager`'s registry and throws
an error for a command whose agent type is not configured.

### Sub-agent config (`subAgent`)

`SubAgentConfigSchema` controls how sub-agent output is forwarded and bounded:

| Field | Type | Default | Description |
|---|---|---|---|
| `forwardChatOutput` | `boolean` | `false` | Forward chat outputs |
| `forwardStatusMessages` | `boolean` | `true` | Forward status messages |
| `forwardSystemOutput` | `boolean` | `false` | Forward system outputs |
| `forwardHumanRequests` | `boolean` | `true` | Forward human requests |
| `forwardReasoning` | `boolean` | `false` | Forward reasoning |
| `forwardInputCommands` | `boolean` | `true` | Forward input commands |
| `timeout` | `number` | `0` | Sub-agent timeout in seconds (0 = no timeout) |
| `maxResponseLength` | `number` | `10000` | Max response length in characters |
| `minContextLength` | `number` | `1000` | Minimum context length in characters |

### Schema Metadata

The config schema uses `.meta()` annotations that drive the config UI:

| Path | Metadata |
|---|---|
| `agents` | `label: "Agent Types"`, `description: "Agent type definitions, keyed by type name"` |
| `commands` | `label: "Agent Commands"`, `description: "Reusable multi-step commands, keyed by command name"` |
| `agentDirectory` | `description: "Directory where editable agent YAML files are stored"` |
| `agents.*.displayName` | `description: "Human-readable name shown in agent pickers"` |
| `agents.*.description` | `description: "What this agent type is for"` |
| `agents.*.category` | `description: "Group this agent type appears under in pickers"` |
| `agents.*.defaultCommand` | `description: "The default command to run when the message to the agent does not start with a '/'"` |
| `agents.*.debug` | `advanced: true`, `description: "Log extra diagnostic output for this agent type"` |
| `agents.*.initialCommands` | `description: "Commands run automatically when an agent of this type starts"` |
| `agents.*.createMessage` | `advanced: true`, `description: "Message logged when an agent of this type is created"` |
| `agents.*.minimumRunning` | `description: "Keep at least this many agents of this type running"` |
| `agents.*.idleTimeout` | `unit: "s"`, `description: "Shut idle agents down after this long (0 disables)"` |
| `agents.*.maxRunTime` | `unit: "s"`, `description: "Hard limit on agent runtime (0 disables)"` |

## Core Components

### Agent

The central agent runtime. Agents are normally created through `AgentManager` (see Services), but can be constructed
directly with an `app`, `initialState`, a parsed config, and a shutdown signal:

```typescript
import Agent from "@tokenring-ai/agent";
import { AgentConfigSchema } from "@tokenring-ai/agent/schema";
import TokenRingApp from "@tokenring-ai/app";

const app = new TokenRingApp({ app: { workingDirectory: "/tmp", workspaceDirectory: "/tmp", configDirectories: [] } });
const config = AgentConfigSchema.parse({
  agentType: "dev",
  displayName: "Developer",
  description: "A development agent",
  category: "development",
});

const agent = new Agent(app, {}, config, new AbortController().signal);
```

**Properties:**

| Property | Type | Description |
|---|---|---|
| `id` | `string` | Unique human-readable agent identifier |
| `createdAt` | `number` | Timestamp when the agent was created |
| `debugEnabled` | `boolean` | Debug logging toggle, from `config.debug` |
| `displayName` | `string` | Agent display name (getter, from `config.displayName`) |
| `app` | `TokenRingApp` | The application instance |
| `initialState` | `Record<string, unknown>` | Initial state passed to the `StateManager` |
| `config` | `ParsedAgentConfig` | The parsed agent configuration |
| `agentShutdownSignal` | `AbortSignal` | Signal aborted when the agent is shut down |
| `stateManager` | `StateManager<AgentStateSlice<any>>` | The agent's state manager |
| `requireService` / `getService` | bound service resolvers | `app.requireService` / `app.getService`, bound to the app |

**State management methods:**

| Method | Description |
|---|---|
| `initializeState<T>(ClassType, props)` | Initialize a state slice with properties |
| `mutateState<T>(ClassType, callback)` | Modify a state slice with a callback |
| `getState<T>(ClassType)` | Retrieve a state slice |
| `subscribeState<T>(ClassType, callback)` | Subscribe to state changes |
| `waitForState<T>(ClassType, predicate, signal)` | Wait for a state condition |
| `subscribeStateAsync<T>(ClassType, signal)` | Async generator of state snapshots |
| `generateCheckpoint()` | Create a checkpoint `{ agentId, createdAt, sessionId, agentType, state }` |
| `restoreState(state)` | Restore serialized state from a checkpoint |
| `getAgentConfigSlice<T>(key, schema)` | Get a config value validated against `schema`; throws on invalid values |

**Input processing:**

| Method | Description |
|---|---|
| `handleInput(input: InputMessage)` | Queue an input message. Records it in `CommandHistoryState`, runs the `BeforeInputReceived` hook, and emits `input.received`; returns a unique request ID |
| `runBackgroundTask(task)` | Run a background task with the agent shutdown signal; failures are logged via `errorMessage` |

Tasks are executed through `AgentCommandService`'s agent loop, which drains the `inputQueue` one item at a time,
executes the matching command, and emits an `agent.response` event. `runCommand` is no longer a method on `Agent`;
use `AgentCommandService.executeAgentCommand` programmatically.

**Lifecycle and activity:**

| Method | Description |
|---|---|
| `getIdleDuration()` | Milliseconds since the last event (`Infinity` when there are no events) |
| `getRunDuration()` | Milliseconds since the first event (`0` when there are no events) |
| `abortCurrentOperation(reason)` | Abort the currently executing input item; returns `true` if there was one, `false` otherwise |
| `getAbortSignal()` | The abort signal for the currently executing input item; when no input is running, returns the agent's `agentShutdownSignal` |
| `busyWithActivity(message, awaitable)` | Set a temporary activity label while `awaitable` runs; throws outside an executing task |
| `setCurrentActivity(message)` | Set the current activity label; throws outside an executing task |

**Event emission:**

| Method | Description |
|---|---|
| `chatOutput(message)` | Emit `output.chat` |
| `reasoningOutput(message)` | Emit `output.reasoning` |
| `infoMessage(...messages)` | Emit `output.info` |
| `warningMessage(...messages)` | Emit `output.warning` |
| `errorMessage(...messages)` | Emit `output.error` |
| `debugMessage(...messages)` | Emit `output.info` only when `debugEnabled` is `true` |
| `toolCallResult(result)` | Emit a `toolCall` event, validated through `ToolCallResultSchema` |
| `sendInteractionResponse(response)` | Emit `input.interaction` for a pending interaction |

**Human interface:**

| Method | Description |
|---|---|
| `askForApproval({ message, label?, defaultValue?, whenUnanswered? })` | Yes/No approval via a tree-select question; resolves `Promise<boolean>`; unanswered → `whenUnanswered` (default `false`, refused) |
| `askForText({ message, label, masked? })` | Text input; resolves `Promise<string \| null>` |
| `askQuestion(question, { whenUnanswered?, unansweredNote? }?)` | Ask any question type (see Human Interface); resolves the typed result, or the default when unanswered by the deadline |
| `waitForInteraction(interaction)` | Directly initiate an interaction and wait for the response |

Every question waits for an answer up to the agent's deadline, `getAnswerTimeoutSeconds()`: the agent's own `answerTimeoutSeconds` if set, else its nearest parent's, else `null`. Whoever starts an agent chooses it (not the agent type): `null` waits until someone answers (chats started from the app); `0` means nobody can answer, so the question is not posted and its default is taken at once with an info note (bot conversations, code-watch, job agents nobody can be reached for); a number of seconds posts the question with `autoSubmitAt` (the app shows a countdown) and, if unanswered by then, withdraws it with a warning note and takes the default (job agents a person can be reached for get the job's time limit). The default is `whenUnanswered` (`askQuestion(question, { whenUnanswered })`), else the question's own non-empty `defaultValue`, else `null`. `askForApproval` always defaults to refusal — its `defaultValue` only preselects an answer in the UI — unless it is asked with `whenUnanswered: true` (e.g. "compact now?"). A posted question must be answered through a currently executing input item.

### AgentEventState

The `AgentEventState` slice (name `"AgentEventState"`) owns the event log, the input queue, and the execution status.
It is initialized by the `Agent` constructor and is the source of truth for the event stream.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `status` | `"starting" \| "running" \| "shutdown"` | Agent execution status (default `"starting"`) |
| `currentActivity` | `string` | Current activity label (defaults to `"Agent starting..."`) |
| `inputQueue` | `InputQueueItem[]` | Queue of received inputs awaiting execution |
| `currentlyExecutingInputItem` | `InputQueueItem \| null` | The input item currently being executed |
| `events` | `AgentEventEnvelope[]` | Full event history |
| `idle` | `boolean` | Read-only: `inputQueue.length === 0` |

**Methods:**

| Method | Description |
|---|---|
| `pushAgentStatus()` | Append an `agent.status` event reflecting the current status, activity, and queue |
| `pushInputExecution(item)` | Append an `input.execution` event for an item's current state |
| `emit(event)` | Append an event and update queue/status. `input.received` pushes an `InputQueueItem`; `input.execution` with status `finished` removes the item from the queue; `input.interaction` resolves the matching interaction callback |
| `serialize()` | Serialize events, compressing consecutive `output.chat` / `output.reasoning` messages |
| `deserialize(data)` | Restore events; in-flight inputs are cancelled with `agent.response` status `cancelled` |
| `show()` | `Events: <count>` summary |
| `getEventCursorFromCurrentPosition()` | A cursor at the end of the current event list |
| `yieldEventsByCursor(cursor)` | Generator yielding events after the cursor, advancing it |

**Event types.** All events conform to `AgentEventEnvelopeSchema`, a discriminated union on `type`:

| Type | Description |
|---|---|
| `agent.created` | Agent was created (`message`, optional `details`) |
| `agent.stopped` | Agent was stopped |
| `agent.status` | Status update (`status`, `inputExecutionQueue`, `currentActivity`) |
| `agent.response` | Response to an input request, discriminated by `status` (`success` \| `error` \| `cancelled`); `success` may carry `attachments` |
| `output.chat` | Chat output |
| `output.reasoning` | Reasoning output |
| `output.info` | Informational message |
| `output.warning` | Warning message |
| `output.error` | Error message |
| `input.received` | An input message was received (`input`, `requestId`) |
| `cancel` | An input request was cancelled (`requestId`) |
| `input.execution` | Input execution status update (`requestId`, `status` `queued` \| `running` \| `finished`, `currentActivity?`, `availableInteractions?`) |
| `input.interaction` | An interaction response (`requestId`, `interactionId`, `result`) |
| `toolCall` | Tool call result (`name`, `args`, `message`, `actions?`, `failed`, `result`, `attachments?`) |

### CommandHistoryState

The `CommandHistoryState` slice (name `"CommandHistoryState"`) records every message passed to `Agent.handleInput`.

| Property | Type | Description |
|---|---|---|
| `commands` | `string[]` | Command strings in the order they were entered |

| Method | Description |
|---|---|
| `reset()` | Clear the command history |
| `serialize()` / `deserialize(data)` | Persist / restore the command list |
| `show()` | `Commands: <count>` plus the last five commands as a markdown list |

## Human Interface

Question schemas live in `question.ts`. `QuestionSchema` is a discriminated union on `type`:

- **text** — `{ type: "text", label, description?, required, defaultValue, expectedLines, masked, autoSubmitAfter? }`
  resolves to `string` (or `string \| null` when not required). `masked` hides input, e.g. for passwords.
- **treeSelect** — `{ type: "treeSelect", label, description?, minimumSelections?, maximumSelections?, defaultValue, allowFreeform, tree }`
  resolves to `string[]`. The `tree` is an array of `TreeLeaf`:
  `{ name, value }` leaves or `{ name, children }` branches.
- **fileSelect** — `{ type: "fileSelect", allowFiles, allowDirectories, label, description?, minimumSelections?, maximumSelections?, defaultValue }`
  resolves to `string[]`.
- **form** — `{ type: "form", sections: [{ name, description?, fields }] }` resolves to an object keyed by section name,
  with each field resolved per its own type.

Helper functions: `isTreeBranch(node)`, `isTreeValueLeaf(node)`, and `getTreeNodeValue(node)` (returns the node's
`value` for value leaves, or the node's `name` for branches).

```typescript
import { isTreeBranch, isTreeValueLeaf, getTreeNodeValue } from "@tokenring-ai/agent/question";

if (isTreeBranch(node)) {
  // node has children
}
if (isTreeValueLeaf(node)) {
  // node has a value
}
const value = getTreeNodeValue(node);
```

## Services

### AgentManager

Service name `AgentManager`. Description: *"A service which manages agent configurations and spawns agents."*

Registers agent type configurations and spawns agents:

```typescript
import { AgentManager } from "@tokenring-ai/agent";

const agentManager = app.addService(new AgentManager(app));

agentManager.addAgentConfigs(
  AgentConfigSchema.parse({
    agentType: "dev",
    displayName: "Developer",
    description: "A development agent",
    category: "development",
  }),
);

// Spawn by type, from config, or from a checkpoint
const agent = agentManager.spawnAgent({ agentType: "dev" });
const subAgent = agentManager.spawnSubAgent(agent, "dev") // follows the parent's answer deadline;
```

**Configuration methods:**

| Method | Description |
|---|---|
| `addAgentConfigs(...configs)` | Register one or more bundled `ParsedAgentConfig` entries, keyed by `agentType` |
| `reconfigure(agents)` | Reconcile the **bundled** registry against a config record: create missing types, update existing ones, remove undefined ones. Workspace agents are untouched |
| `setWorkspaceAgentConfigs(agents)` | Reconcile the **workspace** registry against the whole agent directory. Called by `AgentDirectoryService` |
| `getAgentConfigEntries()` | All `[agentType, config]` entries, merged across both registries |
| `getAgentConfig(name)` | A single agent config (or undefined); a workspace agent shadows a bundled one of the same name |
| `requireAgentConfig(name)` | Same, but throws when the type is unknown |
| `getAgentSource(name)` | `"workspace"`, `"bundled"`, or undefined when the type is not registered |
| `getAgentTypes()` | All registered agent type names |
| `getAgentTypesLike(pattern)` | Agent config entries matching a glob pattern |

Configs live in two registries because `reconfigure` runs on *every* configuration change and removes anything the
config no longer defines. Keeping filesystem-backed agents in their own registry is what stops an unrelated settings
change from deleting them.

**Agent lifecycle methods:**

| Method | Description |
|---|---|
| `spawnAgentFromConfig(config)` | Create an agent from a full `ParsedAgentConfig` |
| `spawnAgent({ agentType, answerTimeoutSeconds? })` | Create an agent of a registered type; throws when the type is unknown |
| `spawnAgentFromCheckpoint(checkpoint, config?)` | Create an agent from a checkpoint, restoring its state |
| `spawnSubAgent(agent, agentType, config?, { answerTimeoutSeconds? }?)` | Create a child agent of a registered type and call `transferStateFromParent` on each state slice; its answer deadline follows the parent unless set |
| `getAgent(id)` | Get an agent by ID (`Agent \| null`) |
| `getAgents()` | All currently running agents |
| `deleteAgent(agentId, reason)` | Abort and remove an agent, emit `agent.stopped`, detach services, and notify list subscribers; returns `false` when the agent does not exist |
| `subscribeAgentsAsync(signal)` | Async generator of `AgentListEntry[]` snapshots, deduplicated per change |
| `run(signal)` | Housekeeping loop every 15 seconds |

**Automatic lifecycle management** (in the housekeeping loop):

- Idle agents are deleted after `idleTimeout` seconds (`0` disables).
- Agents are deleted after `maxRunTime` seconds (`0` disables).
- Agent types with `minimumRunning > 0` are kept at that many running agents (their questions wait for whoever opens them).

### Background sub-agents (`SubAgentService`)

An agent can start sub-agents that work in the background while it carries on, the way background
terminals work. The chat plugin exposes this to agents as tools:

| Tool | What it does |
|------|--------------|
| `agent_start` | Start a sub-agent with a message; returns its name (e.g. `explore-1`) at once |
| `agent_send` | Send a sub-agent a follow-up; queued if it is still busy, and resumes a closed one |
| `agent_output` | Read its output and status since the last read; `waitSeconds` waits for it to finish |
| `agent_list` | List your sub-agents and the agent types you can start |
| `agent_stop` | Stop a sub-agent and close it (a later message resumes it) |

- **Finishing wakes the parent.** When a sub-agent replies and the parent has not read the reply, the
  parent is sent a message with it once the parent is idle, so the parent never has to poll. Replies
  that arrive close together go in one message. Pass `notify: false` to `agent_start` to read
  results only with `agent_output`.
- **Listed under the parent.** Each sub-agent is a full agent with `parentAgentId` set. The agent lists
  in the app show it nested under its parent. Stopping the parent stops its sub-agents.
- **Questions.** A sub-agent's tool approvals follow the permission setting (`autoToolApprovalLevel`,
  `toolApprovalMode`) of the chat at the top of its parent chain, read at the moment it asks. Changing
  that chat's setting covers its running sub-agents too. Anything above it is asked in the sub-agent's
  own chat; the parent's chat shows a note pointing there. A parent agent can never answer its sub-agents' questions.
- **Closed sub-agents resume.** A sub-agent that was stopped, closed after 30 idle minutes, or lost in a
  restart is not forgotten: the parent remembers its sub-agents in its own saved state, and sending one a
  message (`agent_send`) brings it back from its latest checkpoint (the snapshot taken when it closed, or
  the checkpoint store) with its conversation intact and under its old agent id. `agent_list` shows these
  as `closed`.
- **Limits.** At most 8 working sub-agents per agent, nesting 3 deep. An agent remembers its last 50.

`/agent run --bg` and agent commands that start a different agent type use the same service.

### Unattended jobs (`AgentJobService`)

The one way to run an agent unattended (queue items, task dispatches, workflow runs, scheduled prompts):
spawn, send, wait, cancel, time and cost limits, cleanup, lineage, and one persisted record per job.

```ts
const jobs = app.requireService(AgentJobService);
const session = jobs.startJob({ owner: "workflow", label: "release · step 1", agentType: "code", origin: { kind: "agent", agent } });
const step = await session.run({ from: "Workflow release", message: "Run the tests" }); // { status, message, output, requestId }
await session.finish(step.status === "success" ? "succeeded" : "failed", step.message);

await jobs.runOnce(spec, input);                                       // start + run + finish
await jobs.runInAgent(chatAgent, input, { signal, timeoutSeconds });   // an existing agent; cancels only its own input
jobs.cancel(jobId, "reason");                                          // cascades to every job under it
```

- **Lineage and limits (`agent.jobs`).** A job started from an agent (or from anything under a job agent) is
  that job's child in the job tree. Job agents themselves are always top-level (they take over the starter's
  working state), so a job keeps running when the job or chat that started it ends; cancelling a job still
  cancels everything it started. `maxDepth` [3] counts across owners;
  `maxDescendants` [20] caps one top-level tree; `maxConcurrent` [8] caps running job agents app-wide —
  `startJob` throws `LimitError`, or with `{ wait: true }` returns a promise that waits for a slot.
  `parentJobId` places a job under a job whose agent is gone (background run groups).
- **Approvals.** The starter's approval policy (an agent's effective one; `chat.agentDefaults` for a person or
  schedule) is snapshotted at start, capped at `maxAutoApprovalLevel` [5] (and at the job agent type's own
  level), and written into the job agent's chat settings. It is pinned: it does not follow the chat above it,
  and the job agent's own sub-agents follow the job agent.
- **Needing a person.** When approval escalation is configured (`bot.escalation.target`, covering the job's
  agent type), a job agent's `answerTimeoutSeconds` is the job's time limit: a question shows in the app, is escalated
  over chat, and unanswered by then takes its default (approvals are refused). Otherwise it is 0 and questions take
  their defaults at once. The deadline is set on the job agent itself, so it never follows a parent.
- **Time, cost, cleanup.** `timeoutSeconds` [1800] per job; optional `limits.maxCostUsd` (read from metrics
  after each step). A succeeded job's agent is deleted; a failed or cancelled one an hour later; `cleanup: "keep"`
  leaves it.
- **Records.** `agent-jobs.json` in the workspace keeps the last 1000. A job that was running when the app
  stopped or crashed is `interrupted` and never re-run. Owners can `subscribe`/`onJobFinished`; the UI uses
  `/rpc/agent-jobs` (`listJobs`, `streamJobs`, `cancelJob`): the Agents app's **Agent jobs** page (`/agents/jobs`,
  `?job=<id>` opens one). `ownerRef` on a spec (queue `{ queue }`, tasks `{ board, task }`, workflow `{ run }`,
  scheduler `{ schedule }`) is kept on the record so that page can link each job to its owner's entry.

### AgentDirectoryService

Service name `AgentDirectoryService`. Description: *"Manages editable agent types, backed by YAML files on disk."*

CRUD over `<agentDirectory>/<agentType>.yaml`, mirroring `WorkflowService`. Every mutation re-syncs the whole directory
into `AgentManager`, and `plugin.install` awaits one sync before the first `reconfigure` so that config-defined agent
commands can resolve a workspace `agentType`.

| Method | Description |
|---|---|
| `getAgentDirectory()` | Absolute path of the agent directory |
| `listAgentDefinitions()` | Every valid definition, sorted by name; unparseable files are logged and skipped |
| `getAgentDefinition(name)` | One definition, or `null` when the file does not exist |
| `createAgentDefinition(name, agent)` | Write a new file; throws when one already exists |
| `updateAgentDefinition(name, agent)` | Overwrite an existing file; throws when it does not exist |
| `deleteAgentDefinition(name)` | Remove the file; returns `false` when it was not there |
| `syncToManager()` | Re-read the directory and replace the workspace agent types in `AgentManager` |

Names must match `/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`, checked before any path is built.

### AgentCommandService

Service name `AgentCommandService`. Description: *"A service which registers and dispatches agent commands."*

Registers and dispatches `TokenRingAgentCommand` objects with typed input schemas:

```typescript
import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingAgentCommand } from "@tokenring-ai/agent/types";

const commandService = app.addService(new AgentCommandService());

commandService.addAgentCommands({
  name: "hello",
  description: "Say hello",
  inputSchema: { remainder: { name: "name", description: "Name to greet", required: true } },
  execute: ({ remainder }) => `Hello, ${remainder}!`,
  help: "## /hello\n\nGreets the given name.",
} satisfies TokenRingAgentCommand);
```

**Command registration:**

| Method | Description |
|---|---|
| `addAgentCommands(commands)` | Register commands (and their aliases) into the registry |
| `reconfigure(commandConfigs, agentManager)` | Reconcile package-config commands against the registry; built-in commands are left alone. Validates that each command's `agentType` exists |
| `getCommandNames()` | All registered command names (including aliases) |
| `getCommandEntries()` | All `[name, command]` entries |
| `getCommand(name)` | A single command (or undefined) |

**Command dispatch:**

| Method | Description |
|---|---|
| `executeAgentCommand(agent, message, attachments?)` | Parse and execute a command message, returning a `TokenRingAgentCommandResult` (`{ message, details?, attachments? }`); unknown or invalid commands throw `CommandFailedError`; calling it with no input running also throws, since commands run as part of an agent's input (send it with `agent.handleInput`) |
| `runAgentLoop(agent, signal)` | The per-agent loop: sets status to `running`, emits startup `initialCommands`, drains the input queue, and executes each item through the agent lifecycle hooks |
| `attach(agent)` | Start the agent command loop in the background for an agent |

**Command parsing behavior** (`executeAgentCommand`):

- A blank message runs `/help`.
- Text starting with `@` is a chat message like any other; mentions in it are resolved by the chat.
- Text that does not start with `/` is prefixed with the agent's `defaultCommand` (`/chat send` by default).
- `/help <command>` returns that command's help text.
- Commands are matched by longest prefix of the input after the leading `/`.
- Unknown commands throw `CommandFailedError` listing possible matching commands.

**Input schema types** (`types.ts`):

- `TokenRingAgentCommand<InputSchema>` — `{ name, alias?, description, help, inputSchema, execute }`. Named `--args`,
  positional values, and the remainder are merged into a single `args` object passed to `execute` alongside `agent`
  (and `attachments` when `allowAttachments` is set).
- `AgentCommandArgumentSchema` — `string`, `number`, `flag`, `date`, or `enum` arguments, each with
  `description`, optional `required`, `defaultValue`, and `minimum`/`maximum` where applicable.
- `AgentCommandPositionalSchema` / `AgentCommandRemainderSchema` — positional and remainder parameters with
  `name`, `description`, optional `required`, and `defaultValue`.

### Plugin Lifecycle

Plugin metadata:

| Field | Value |
|---|---|
| `name` | `@tokenring-ai/agent` |
| `displayName` | `Agent Core` |
| `version` | `0.2.0` |
| `description` | `Central orchestrator for managing AI agents, tools, commands, and state persistence.` |
| `configSchema` | `AgentPackageConfigSchema` |

`install(app)` performs the following steps:

1. Registers `AgentCommandService` on the app and registers the built-in agent commands (from `commands.ts`).
2. Registers `AgentManager` on the app.
3. Waits for `RpcService` and registers the `/rpc/agent` endpoint.
4. Waits for `DebugService` and registers an agent snapshot source (`createAgentSnapshotSource(app)`), exposing each
   running agent as a debug capture target (id, label, description, idle status, and activity).

`reconfigure(app, config)` reconciles live registries when the package config changes:

1. Applies `config.agents` to `AgentManager`, creating, updating, and removing **bundled** agent types.
2. Applies the config to `AgentDirectoryService`, re-syncing workspace agents when `agentDirectory` changed.
3. Applies `config.commands` to `AgentCommandService`, creating and removing config-defined commands (each must
   reference a configured `agentType`). This runs last, so both agent registries are already populated.

## Lifecycle Hooks

The package defines two hook payload classes dispatched through `AgentLifecycleService` from `@tokenring-ai/lifecycle`.
Hook toggling follows the standard `AgentLifecycleService` API (`enableHooks` / `disableHooks` / `setEnabledHooks`).

### BeforeInputReceived

Exported from `@tokenring-ai/agent`. Payload: `{ input: InputMessage }`.

Triggered by `Agent.handleInput` before the `input.received` event is emitted. Callbacks can mutate `input.message`
(the mutated message is what is logged to the event stream). The original message is retained in `CommandHistoryState`.

```typescript
import { BeforeInputReceived } from "@tokenring-ai/agent";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";

const subscription = {
  name: "my-input-hook",
  displayName: "My Input Hook",
  description: "Mutates incoming input",
  callbacks: [
    new HookCallback(BeforeInputReceived, data => {
      data.input.message = `[prefixed] ${data.input.message}`;
    }),
  ],
};
```

### AfterSubAgentResponse

Import from `@tokenring-ai/agent/hooks`. Payload: `{ request: RunSubAgentOptions, result: RunSubAgentResult }`.

Triggered after a sub-agent completes execution. Executed by the `/agent run` command and by `createAgentCommand`
(when the spawned sub-agent is not in the background).

```typescript
import { AfterSubAgentResponse } from "@tokenring-ai/agent/hooks";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";

const subscription = {
  name: "my-sub-agent-hook",
  displayName: "My Sub-Agent Hook",
  description: "Reacts to sub-agent completion",
  callbacks: [
    new HookCallback(AfterSubAgentResponse, ({ request, result }) => {
      // request: RunSubAgentOptions, result: RunSubAgentResult
    }),
  ],
};
```

## RPC Endpoints

Registered under `/rpc/agent` (schema name "Agent RPC") with 19 methods:

| Method | Type | Description |
|---|---|---|
| `getAgentConfig` | query | `{ agentId }` → `{ status: "success", ...agentConfig }` or `agentNotFound` |
| `getAgentEvents` | query | `{ agentId, fromPosition }` → `{ status: "success", events, position }` or `agentNotFound` |
| `streamAgentEvents` | stream | `{ agentId, fromPosition }` → streaming `{ status: "success", events, position }` or `agentNotFound` |
| `listAgents` | query | `{}` → `AgentListEntry[]` |
| `streamAgents` | stream | `{}` → streaming `AgentListEntry[]` snapshots |
| `getAgentTypes` | query | `{}` → `{ type, displayName, description, category?, enabledTools, source, installedFrom? }[]` |
| `createAgent` | mutation | `{ agentType, answerTimeoutSeconds? }` → `{ id, displayName, description }` |
| `deleteAgent` | mutation | `{ agentId, reason }` → `{ status: "success" }` or `agentNotFound` |
| `sendInput` | mutation | `{ agentId, input }` → `{ status: "success", requestId }` or `agentNotFound` |
| `sendInteractionResponse` | mutation | `{ agentId, response }` → `{ status: "success" }` or `agentNotFound` |
| `abortCurrentOperation` | mutation | `{ agentId, message }` → `{ status: "success" }` or `agentNotFound` |
| `getCommandHistory` | query | `{ agentId }` → `{ status: "success", history }` or `agentNotFound` |
| `getAvailableCommands` | query | `{ agentId? }` → `{ status: "success", commands }` or `agentNotFound` |
| `getAgentDirectory` | query | `{}` → `{ directory }` |
| `listAgentDefinitions` | query | `{}` → `AgentDefinition[]` (workspace agents only) |
| `getAgentTypeDetail` | query | `{ type }` → `{ status: "success", source, agent, updatedAt }` or `agentTypeNotFound`. Works for bundled types too, so they can be cloned |
| `createAgentDefinition` | mutation | `{ name, agent }` → `{ agent }` |
| `updateAgentDefinition` | mutation | `{ name, agent }` → `{ agent }` |
| `deleteAgentDefinition` | mutation | `{ name }` → `{ success }` |

`AgentListEntry` is `{ id, createdAt, agentType, displayName, description, idle, currentActivity }`. `getAgentTypes`
returns `enabledTools` from the agent type's `chat.enabledTools` config (empty array when not set), plus `source`
(`"bundled"` or `"workspace"`) and, for agents installed from a marketplace registry, `installedFrom`.
The agent-definition mutations throw on failure like the workflow CRUD methods do.
`getAvailableCommands` lists commands from the app-level registry when `agentId` is omitted, and from the agent's own
registry when it is provided; commands are sorted by name and deduplicated, each with `{ name, description, inputSchema }`.

Where a method can fail because the agent does not exist, the result is a discriminated union on `status`:

| Status | Additional Fields | Description |
|---|---|---|
| `success` | method-specific payload | The operation succeeded |
| `agentNotFound` | — | No agent with the given `agentId` exists |

## Utilities

### `runSubAgent`

The sub-agent execution function (the direct replacement for the former `SubAgentService`). Runs a child agent with
configurable output forwarding and returns its result:

```typescript
import { runSubAgent } from "@tokenring-ai/agent/util/runSubAgent";

const result = await runSubAgent({
  agentType: "researcher",
  from: "parent",
  steps: ["/chat send Research {topic}"],
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

**`RunSubAgentOptions`:**

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `agentType` | `string` | yes | — | The type of agent to create |
| `from` | `string` | yes | — | The source of the input |
| `steps` | `SubAgentStep[]` | yes | — | The command(s) to send to the agent (must be non-empty) |
| `options` | `ParsedSubAgentConfig` | yes | — | Configuration options for sub-agent execution |
| `parentAgent` | `Agent` | yes | — | The parent agent instance |
| `background` | `boolean` | no | `false` | Run in the background and return immediately |
| `autoCleanup` | `boolean` | no | `true` | Auto-delete the child agent when done |

`SubAgentStep` is `string \| Pick<InputMessage, "message" \| "attachments">`.

**`RunSubAgentResult`:**

| Field | Type | Description |
|---|---|---|
| `status` | `"success" \| "error" \| "cancelled"` | Execution result |
| `response` | `string` | Response from the agent (potentially truncated by `minContextLength` / `maxResponseLength`) |
| `childAgent` | `Agent` | Only present when `background` is `true` or `autoCleanup` is `false` |

Forwarding follows the sub-agent config options (`forwardChatOutput`, `forwardReasoning`, `forwardStatusMessages`,
`forwardSystemOutput`, `forwardHumanRequests`, `forwardInputCommands`). When the child requests a human interaction and
`forwardHumanRequests` is enabled, the question is mirrored to the parent agent. A `timeout` (in seconds, `0` disables)
aborts the child. When the parent agent aborts, the child is cancelled.

### `createAgentCommand`

Registers an agent as a callable command:

```typescript
import { createAgentCommand } from "@tokenring-ai/agent/util/createAgentCommand";
import type { ParsedAgentCommandConfig } from "@tokenring-ai/agent/schema";

// createAgentCommand expects a fully parsed config (all schema defaults applied)
const config: ParsedAgentCommandConfig = {
  agentType: "researcher",
  description: "Research a topic",
  commandSchema: { remainder: { name: "topic", description: "Topic to research", required: true } },
  background: false,
  requireNewAgent: false,
  steps: ["Research: {topic}"],
  subAgent: {
    forwardChatOutput: true,
    forwardStatusMessages: true,
    forwardSystemOutput: false,
    forwardHumanRequests: true,
    forwardReasoning: false,
    forwardInputCommands: true,
    timeout: 0,
    maxResponseLength: 10000,
    minContextLength: 1000,
  },
};

const command = createAgentCommand("research", config);
```

Behavior:

- When `requireNewAgent` is `false` (default) and the invoking agent already has the command's `agentType`, the steps
  run in place on the current agent via `/chat send`, and the last step's message is returned.
- Otherwise a new agent of the target type is spawned. When the agent types differ, the sub-agent runs in the background
  by default so the parent is not blocked; when `requireNewAgent` is `true`, the sub-agent's `background` setting comes
  from the command config.
- Each step interpolates `{<remainder.name>}` with the command's remainder value.
- When the sub-agent is not backgrounded, the `AfterSubAgentResponse` hook is executed, and cancelled/failed runs throw
  `CommandFailedError`.

### `projectAgentList`

Projects agents into a serializable `AgentListEntry[]`:

```typescript
import { projectAgentList, type AgentListEntry } from "@tokenring-ai/agent/util/projectAgentList";

const entries: AgentListEntry[] = projectAgentList(agentManager.getAgents());
// { id, createdAt, agentType, displayName, description, idle, currentActivity }
```

### `createAgentStateSliceStream`

Creates an async generator that streams projections of an agent's state slice over RPC:

```typescript
import { createAgentStateSliceStream } from "@tokenring-ai/agent/rpc/createAgentStateStream";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";

const stream = createAgentStateSliceStream({
  SliceClass: AgentEventState,
  project: (state, agent) => ({ events: state.events.length }),
  equals: (a, b) => a.events === b.events, // optional dedup
});
```

The returned function takes `{ agentId }`, the app, and an `AbortSignal`, and yields the projected value on each change
(or `{ status: "agentNotFound" }` when the agent does not exist).

### `formatAgentId`

Formats an agent ID consistently to its first 8 characters:

```typescript
import { formatAgentId } from "@tokenring-ai/agent/util/formatAgentId";

const shortId = formatAgentId(agent.id); // first 8 chars
```

### `parseAgentCommandInput`

Tokenizes and validates command input against a command's `inputSchema`, applying defaults and range checks and throwing
`CommandFailedError` with the formatted usage on invalid input:

```typescript
import { parseAgentCommandInput } from "@tokenring-ai/agent/util/parseAgentCommandInput";

const parsed = parseAgentCommandInput(command, "--type leader analyze the code", [], agent);
// { agent, args: { type: "leader" }, remainder: "analyze the code" }
```

## Errors

The package exports `CommandFailedError` from `@tokenring-ai/agent/AgentError`. It is thrown for command failures:
unknown commands, invalid agent invocations, command input validation errors, and cancelled/failed sub-agent runs.

```typescript
import { CommandFailedError } from "@tokenring-ai/agent/AgentError";

try {
  await agentCommandService.executeAgentCommand(agent, "/unknown-command");
} catch (error) {
  if (error instanceof CommandFailedError) {
    console.log("Command failed:", error.message);
  }
}
```

## Dependencies

| Package | Purpose |
|---|---|
| `@tokenring-ai/app` | Application framework: `TokenRingApp`, `StateManager`, plugin and service types, debug service |
| `@tokenring-ai/lifecycle` | Lifecycle hook dispatch (`AgentLifecycleService`) and hook payloads |
| `@tokenring-ai/rpc` | JSON-RPC endpoint registration |
| `@tokenring-ai/utility` | String, map, and registry utilities |
| `uuid` | Unique IDs for interactions and requests |
| `zod` | Schema validation |

## Testing

The package ships unit, integration, and RPC tests:

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun test --coverage   # with coverage
```

The suite covers:

- `Agent` — initialization and state slices, input handling, event emission, lifecycle/durations, human interface,
  config slices, checkpointing and restore, debug mode, background tasks, and interaction responses.
- `AgentManager` — config registration and reconciliation, spawning (by type, from config, from checkpoint), sub-agent
  state transfer, storage/retrieval/deletion, idle and max-runtime cleanup, minimum-running enforcement, and
  `subscribeAgentsAsync` snapshot streams.
- `AgentCommandService` — registration, aliases, lookup, and reconfiguration.
- `parseAgentCommandInput` — args, positionals, remainder, attachments, defaults, and validation errors.
- `createAgentCommand` — in-place execution vs. background sub-agent spawning (`requireNewAgent` behavior).
- `AgentLifecycleService` — hook registration, management, and execution.
- RPC — `streamAgents` streaming and `createAgentStateSliceStream` projection/dedup/abort behavior.
- Commands — `/help` and `/branch`.
- Integration — command service, lifecycle service, and agent manager workflows together.

`bun run build` type-checks the package with `tsc --noEmit`.

## Package Structure

```text
plugin/agent/
├── Agent.ts                          # Core Agent class implementation
├── AgentEvents.ts                    # Event schemas and types (AgentEventEnvelope, InputMessage, ToolCallResult, ...)
├── AgentError.ts                     # CommandFailedError
├── AgentDirectoryService.ts          # YAML CRUD for workspace-authored agent types
├── types.ts                          # Command schema types, AgentStateSlice, checkpoint schema
├── schema.ts                         # AgentConfig / AgentPackageConfig / AgentItem / InstallSource schemas
├── question.ts                       # Question schemas (text, treeSelect, fileSelect, form) and helpers
├── index.ts                          # Package exports
├── plugin.ts                         # TokenRing plugin integration (install / reconfigure)
├── commands.ts                       # Built-in command registry
├── hooks.ts                          # AfterSubAgentResponse hook payload
├── lifecycle.ts                      # BeforeInputReceived hook payload
├── package.json                      # Package configuration
├── bun.config.ts                     # Bun test configuration
├── commands/                         # Built-in commands
│   ├── agent/
│   │   ├── list.ts                   # /agent list
│   │   ├── run.ts                    # /agent run
│   │   ├── shutdown.ts               # /agent shutdown
│   │   └── types.ts                  # /agent types
│   ├── debug/
│   │   ├── app.ts                    # /debug app shutdown
│   │   ├── chat.ts                   # /debug chat throwError
│   │   ├── checkpoint.ts             # /debug checkpoint
│   │   ├── commands.ts               # /debug commands
│   │   ├── logging.ts                # /debug logging
│   │   ├── markdown.ts               # /debug markdown
│   │   ├── markdown.sample.md        # Markdown sample output
│   │   ├── questions.ts              # /debug questions
│   │   └── services.ts               # /debug services
│   ├── branch.ts                     # /branch
│   ├── help.ts                       # /help
│   └── settings.ts                   # /settings
├── debug/
│   └── agentSnapshotSource.ts        # DebugService snapshot source for running agents
├── services/
│   ├── AgentCommandService.ts        # Command registration and dispatch service
│   └── AgentManager.ts               # Agent lifecycle and configuration service
├── state/
│   ├── agentEventState.ts            # Event log / input queue state slice
│   └── commandHistoryState.ts        # Command history state slice
├── rpc/
│   ├── agent.ts                      # /rpc/agent endpoint implementation
│   ├── createAgentStateStream.ts     # Agent state slice streaming utility
│   ├── createAgentStateStream.test.ts
│   └── schema.ts                     # RPC schema definitions
├── util/
│   ├── createAgentCommand.ts         # Config-defined command factory
│   ├── formatAgentCommandUsage.ts    # Command usage formatting helpers
│   ├── formatAgentId.ts              # Short agent ID formatting
│   ├── parseAgentCommandInput.ts     # Command input tokenization and validation
│   ├── projectAgentList.ts           # Agent list projection
│   └── runSubAgent.ts                # Sub-agent execution engine
└── test/
    ├── createTestingAgent.test.ts    # Shared test agent factory
    ├── integration/
    │   └── agent-integration.test.ts
    └── unit/
        ├── agent.test.ts
        ├── AgentCommandService.test.ts
        ├── AgentLifecycleService.test.ts
        ├── AgentManager.test.ts
        ├── AgentManager.subscribeAgentsAsync.test.ts
        ├── AgentDirectoryService.test.ts
        ├── agentDirectory.rpc.test.ts
        ├── createAgentCommand.test.ts
        ├── parseAgentCommandInput.test.ts
        ├── streamAgents.rpc.test.ts
        └── commands/
            ├── branch.test.ts
            └── help.test.ts
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
