### Adding Agent Functionality to TokenRing Writer

After reviewing the codebase, particularly the template package and tool registry implementation, I've developed a plan to add agent functionality to the TokenRing Writer project. This implementation would expose agents as individual tools that can be used by a dispatcher/planner.

## Implementation Plan

### 1. Create a New Package for Agents

First, we should create a new package called `agent` in the `pkg` directory:

```
pkg/agent/
```

This package will contain the core functionality for defining, registering, and executing agents.

### 2. Define Agent Interface and Base Class

Create an `AgentRegistry` service similar to the `TemplateRegistry`:

```javascript
// pkg/agents/AgentRegistry.ts
import {Registry, Service} from "@token-ring/registry";

export type AgentFunction = (input: string, registry: Registry) => Promise<{
  output: string;
  metadata?: Record<string, any>;
}>;

export default class AgentRegistry extends Service {
  name = "AgentRegistry";
  description = "Provides a registry of AI agents";

  // Map of agent names to agent functions
  agents: Map<string, AgentFunction> = new Map();

  /**
   * Register an agent function with a name
   */
  register(name: string, agent: AgentFunction) {
    if (typeof agent !== "function") {
      throw new Error(`Agent must be a function, got ${typeof agent}`);
    }
    this.agents.set(name, agent);
  }

  /**
   * Unregister an agent by name
   */
  unregister(name: string): boolean {
    return this.agents.delete(name);
  }

  /**
   * Get an agent function by name
   */
  get(name: string): AgentFunction | undefined {
    return this.agents.get(name);
  }

  /**
   * List all registered agent names
   */
  list(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Run an agent with the given input
   */
  async runAgent(
    { agentName, input }: { agentName: string; input: string },
    registry: Registry,
  ): Promise<any> {
    if (!agentName) {
      return { error: "Agent name is required" };
    }

    const agent = this.get(agentName);

    if (!agent) {
      return { error: `Agent not found: ${agentName}` };
    }

    try {
      // Execute the agent function with the input
      return await agent(input, registry);
    } catch (error: any) {
      return {
        ok: false,
        error: error?.message || "Unknown error running agent",
      };
    }
  }
}
```

### 3. Implement Agent Tools

Create tools to interact with agents, similar to how template tools are implemented:

```javascript
// pkg/agents/tools/runAgent.ts
import {Registry} from "@token-ring/registry";
import {z} from "zod";
import AgentRegistry from "../AgentRegistry.ts";
import ChatService from "@token-ring/chat/ChatService";

/**
 * Runs an agent with the given input via the tool interface
 */
export async function execute(
  {agentName, input}: { agentName?: string; input?: string },
  registry: Registry,
): Promise<{
  ok: boolean;
  output?: string;
  metadata?: Record<string, any>;
  error?: string;
}> {
  const chatService: ChatService = registry.requireFirstServiceByType(ChatService);
  const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);

  chatService.infoLine(`[runAgent] Running agent: ${agentName}`);
  
  if (!agentName) {
    return {
      ok: false,
      error: "Agent name is required",
    };
  }
  
  if (!input) {
    return {
      ok: false,
      error: "Input is required",
    }
  }

  try {
    // Use the AgentRegistry's runAgent method
    return await agentRegistry.runAgent({agentName, input}, registry);
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Unknown error running agent",
    };
  }
}

export const description =
  "Run an AI agent with the given input. Agents are specialized AI assistants that can perform specific tasks.";

export const parameters = z.object({
  agentName: z.string().describe("The name of the agent to run."),
  input: z.string().describe("The input to pass to the agent."),
});
```

And a tool to list available agents:

```javascript
// pkg/agents/tools/listAgents.ts
import {Registry} from "@token-ring/registry";
import {z} from "zod";
import AgentRegistry from "../AgentRegistry.ts";

/**
 * Lists all available agents via the tool interface
 */
export async function execute({},
  registry: Registry,
): Promise<{
  ok: boolean;
  agents: string[];
  error?: string;
}> {
  try {
    const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);

    // Get the list of agents
    const agents = agentRegistry.list();

    return {
      ok: true,
      agents,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Unknown error listing agents",
      agents: [],
    };
  }
}

export const description =
  "Lists all available agents. Returns an array of agent names that can be used with the runAgent tool.";

export const parameters = z.object({});
```

### 4. Create Agent Implementations

Create a directory for agent implementations:

```
pkg/agents/implementations/
```

Example agent implementation:

```javascript
// pkg/agents/implementations/researchAgent.ts
import {Registry} from "@token-ring/registry";
import {execute as runChat} from "@token-ring/ai-client/runChat";

export async function researchAgent(input: string, registry: Registry) {
  // Example implementation that uses AI to perform research
  const [output, response] = await runChat({
    input: `I need you to research the following topic and provide a comprehensive summary: ${input}`,
    systemPrompt: "You are a research specialist tasked with gathering and synthesizing information.",
    model: "gpt-4",
  }, registry);

  return {
    output,
    metadata: {
      usage: response.usage,
      timing: response.timing,
    }
  };
}
```

### 5. Create Package Entry Point

Create a package entry point to register the service and expose tools:

```javascript
// pkg/agents/index.ts
import {TokenRingPackage} from "@token-ring/registry";
import AgentRegistry from "./AgentRegistry.ts";
import * as runAgent from "./tools/runAgent.ts";
import * as listAgents from "./tools/listAgents.ts";
import {researchAgent} from "./implementations/researchAgent.ts";
// Import other agent implementations

const agentRegistry = new AgentRegistry();

// Register the built-in agents
agentRegistry.register("research", researchAgent);
// Register other agent implementations

const pkg: TokenRingPackage = {
  name: "@token-ring/agents",
  version: "0.1.0",
  description: "AI Agents for TokenRing Writer",
  
  // Register services
  async start(registry) {
    // Register the agent registry service
    registry.services.register(agentRegistry);
    
    // Load the initial agents
    const agents = registry.requireFirstServiceByType(AgentRegistry);
    
    // You can load agents from a configuration or other source here
  },
  
  // Tools exposed by this package
  tools: {
    runAgent,
    listAgents,
  },
};

export default pkg;
```

### 6. Add ChatCommand for Agent Interaction

Create a chat command for direct interaction with agents:

```javascript
// pkg/agents/chatCommands/agent.ts
import {z} from "zod";
import {Registry} from "@token-ring/registry";
import ChatService from "@token-ring/chat/ChatService";
import AgentRegistry from "../AgentRegistry.ts";

export async function execute(
  {command, args}: { command: string; args: string[] },
  registry: Registry,
): Promise<void> {
  const chatService: ChatService = registry.requireFirstServiceByType(ChatService);
  const agentRegistry: AgentRegistry = registry.requireFirstServiceByType(AgentRegistry);
  
  if (!command) {
    displayHelp(chatService);
    return;
  }
  
  switch (command.toLowerCase()) {
    case "list":
      const agents = agentRegistry.list();
      if (agents.length === 0) {
        chatService.systemLine("No agents registered.");
      } else {
        chatService.systemLine("Available agents:");
        for (const agentName of agents) {
          chatService.systemLine(`- ${agentName}`);
        }
      }
      break;
      
    case "run":
      const [agentName, ...inputParts] = args;
      const input = inputParts.join(" ");
      
      if (!agentName) {
        chatService.systemLine("Error: Agent name is required.");
        chatService.systemLine("Usage: /agent run <agentName> <input>");
        return;
      }
      
      if (!input) {
        chatService.systemLine("Error: Input is required.");
        chatService.systemLine("Usage: /agent run <agentName> <input>");
        return;
      }
      
      chatService.systemLine(`Running agent: ${agentName}`);
      chatService.emit("waiting", null);
      
      try {
        const result = await agentRegistry.runAgent({agentName, input}, registry);
        if (result.error) {
          chatService.errorLine(result.error);
        } else {
          chatService.aiLine(result.output);
        }
      } catch (error: any) {
        chatService.errorLine(`Error running agent:`, error);
      } finally {
        chatService.emit("doneWaiting", null);
      }
      break;
      
    default:
      chatService.systemLine(`Unknown command: ${command}`);
      displayHelp(chatService);
      break;
  }
}

function displayHelp(chatService: ChatService): void {
  chatService.systemLine("Agent Commands:");
  chatService.systemLine("  /agent list - List all available agents");
  chatService.systemLine("  /agent run <agentName> <input> - Run an agent with the specified input");
}

export const schema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
});

export const description = "Interact with AI agents";
```

### 7. Create a Dispatcher/Planner

The dispatcher/planner can be implemented as a special agent that decides which agents to use:

```javascript
// pkg/agents/implementations/plannerAgent.ts
import {Registry} from "@token-ring/registry";
import {execute as runChat} from "@token-ring/ai-client/runChat";
import AgentRegistry from "../AgentRegistry.ts";

export async function plannerAgent(input: string, registry: Registry) {
  const agentRegistry = registry.requireFirstServiceByType(AgentRegistry);
  const availableAgents = agentRegistry.list();
  
  // First, plan which agents to use
  const [planOutput] = await runChat({
    input: `Task: ${input}\n\nAvailable agents: ${availableAgents.join(", ")}\n\nPlease analyze this task and determine which agent(s) would be best suited to handle it. Provide a step-by-step plan for using these agents.`,
    systemPrompt: "You are a planning agent that determines the best approach to solving complex tasks by coordinating specialized agents.",
    model: "gpt-4",
  }, registry);
  
  // The planner could also execute the agents according to the plan
  // This is a simplified example - a real implementation would parse the plan and execute it
  
  return {
    output: `## Task Planning\n\n${planOutput}\n\nTo execute this plan, you can use the runAgent tool with the specified agents.`,
    metadata: {
      plan: planOutput,
      availableAgents,
    }
  };
}
```

### 8. Add to Package.json

Finally, add the new package to the project's package.json:

```json
"dependencies": {
  // other dependencies
  "@token-ring/agents": "0.1.0"
}
```

## Integration with Template System

The agent system can leverage the existing template system for prompt generation. Agents can use templates to construct their prompts, and templates can specify which agents to use for specific tasks.

For example, a template could include an "agent" property:

```javascript
export async function analyzeCode(input) {
  return {
    request: {
      input: `Please analyze the following code:\n\n${input}`,
      systemPrompt: "You are a code analysis expert.",
      model: "gpt-4",
    },
    agent: "codeAnalysis", // Specify an agent to handle this template
  };
}
```

## Benefits of This Approach

1. **Modular Design**: Each agent is a separate entity with its own functionality
2. **Tool-based Interface**: Agents are exposed as tools, making them compatible with the existing system
3. **Composability**: Agents can be composed by the planner to solve complex tasks
4. **Extensibility**: New agents can be added without changing the core system
5. **Integration**: Leverages existing infrastructure like the registry and chat systems

This implementation provides a flexible framework for adding agent functionality to the TokenRing Writer codebase while maintaining compatibility with the existing architecture.