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
    {agentName, input}: { agentName: string; input: string },
    registry: Registry,
  ): Promise<
    | { output: string; metadata?: Record<string, any> }
  > {
    if (!agentName) {
      throw new Error("Agent name is required");
    }

    const agent = this.get(agentName);

    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    // Execute the agent function with the input
    return await agent(input, registry);
  }
}