# TokenRing Agent Package

## Overview

- `@token-ring/agent` provides a lightweight agent framework for the Token Ring ecosystem. It registers an `AgentRegistry` service that manages named AI agents and exposes tools and chat commands to list and run them.
- The package ships with two built-in agents:
  - **research**: gathers and synthesizes information on a given topic.
  - **planner**: suggests a plan by analyzing a task and available agents.

## Key Concepts

- **Agent**: An async function `(input: string, registry: Registry) => Promise<{ output: string; metadata?: Record<string, any> }>`
- **AgentRegistry Service**: A registry for adding, removing, listing, and running agents at runtime.
- **Tools**: `listAgents` and `runAgent` are exposed via the Token Ring tool interface.
- **Chat Command**: `/agent list` and `/agent run <name> <input>`

## Package Exports

- **default TokenRingPackage** (`index.ts`):
  - Registers `AgentRegistry` as a service on `start()`.
  - Registers built-in agents (research, planner).
  - Exposes tools: `runAgent` and `listAgents`.
- **AgentRegistry** (`AgentRegistry.ts`): Class for managing agents.
- **Tools** (`tools/*.ts`): `runAgent`, `listAgents`.
- **Chat command** (`chatCommands/agent.ts`): `/agent` entry point.
- **Agent implementations** (`implementations/*.ts`): `researchAgent`, `plannerAgent`.

## Installation

This package is part of the monorepo and is typically consumed through the Token Ring runtime. If you need to depend on it directly in a workspace:

- Add dependency: `"@token-ring/agent": "0.1.0"`
- Ensure peer packages are available: `@token-ring/registry`, `@token-ring/chat`, and (for built-in agents) `@token-ring/ai-client`.

## Getting Started

### 1) Register the package and start services

When the Token Ring runtime loads this package, it will call `start(registry)` and register the `AgentRegistry` service automatically.

### 2) Use the tools

- **listAgents tool**
  - Description: Lists all available agent names.
  - Parameters: none
  - Return shape: `{ ok: boolean; agents: string[]; error?: string }`

- **runAgent tool**
  - Description: Runs an agent by name with string input.
  - Parameters: `{ agentName: string; input: string }`
  - Return shape: `{ ok: boolean; output?: string; metadata?: Record<string, any>; error?: string }`

### Example: Running tools programmatically

```typescript
import agentPkg from "@token-ring/agent";
import { ServiceRegistry } from "@token-ring/registry";

const registry = new ServiceRegistry();
// Register packages (simplified example)
await agentPkg.start(registry);

// Access tools
import * as listAgents from "@token-ring/agent/tools/listAgents";
import * as runAgent from "@token-ring/agent/tools/runAgent";

const list = await listAgents.execute({}, registry);
console.log(list.agents); // ["research", "planner", ...]

const result = await runAgent.execute({ 
  agentName: "research", 
  input: "Quantum computing basics" 
}, registry);

if (result.ok) {
  console.log(result.output);
}
```
```


## Chat Command Usage

Inside the Token Ring chat, use:
- `/agent list`
- `/agent run <agentName> <input>`

**Example:**
```
/agent run research Provide a summary of Rust ownership model
```


## Extending: Registering a Custom Agent

You can register your own agent function at runtime using `AgentRegistry`.

```typescript
import agentPkg from "@token-ring/agent";
import AgentRegistry from "@token-ring/agent/AgentRegistry";
import { ServiceRegistry } from "@token-ring/registry";

const registry = new ServiceRegistry();
await agentPkg.start(registry);

const agents = registry.requireFirstServiceByType(AgentRegistry);

// Define your agent
async function myAgent(input, reg) {
  // do work, optionally use other services from reg
  return { output: `Echo: ${input}` };
}

agents.register("echo", myAgent);

// Now available via tools and /agent run echo
```


## API Reference (high level)

### AgentRegistry
- `register(name: string, agent: AgentFunction): void`
- `unregister(name: string): boolean`
- `get(name: string): AgentFunction | undefined`
- `list(): string[]`
- `runAgent({ agentName, input }, registry): Promise<{ output: string; metadata?: Record<string, any> } | { error: string }>`

### Tools
- `listAgents.execute({}, registry)`
- `runAgent.execute({ agentName, input }, registry)`

### Chat Commands
- `/agent list`
- `/agent run <agentName> <input>`

## Built-in Agents

### researchAgent(input, registry)
- Uses `@token-ring/ai-client/runChat` to produce a research summary.
- Returns `{ output, metadata: { usage, timing } }`

### plannerAgent(input, registry)
- Lists available agents and asks the model to produce a plan.
- Returns `{ output (rendered plan), metadata: { plan, availableAgents, usage, timing } }`

## Notes

- The built-in agents depend on `@token-ring/ai-client`; if you don't need them, you can avoid invoking them or register only your custom agents.
- Tools expect a `ChatService` and `AgentRegistry` to be available via the registry. The package's `start()` registers `AgentRegistry`; ensure `@token-ring/chat` is present to provide `ChatService` in environments where the tools emit chat lines.

## License

MIT, same as the repository license.