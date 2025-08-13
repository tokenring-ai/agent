import type {TokenRingPackage} from "@token-ring/registry";
import {Registry} from "@token-ring/registry";
import AgentRegistry from "./AgentRegistry.ts";
import * as runAgent from "./tools/runAgent.ts";
import * as listAgents from "./tools/listAgents.ts";
import {researchAgent} from "./implementations/researchAgent.ts";
import {plannerAgent} from "./implementations/plannerAgent.ts";

// Create the agent registry
const agentRegistry = new AgentRegistry();

// Register the built-in agents
agentRegistry.register("research", researchAgent);
agentRegistry.register("planner", plannerAgent);

const pkg: TokenRingPackage = {
  name: "@token-ring/agent",
  version: "0.1.0",
  description: "AI Agents for TokenRing Writer",
  
  // Register services
  async start(registry: Registry) {
    // Register the agent registry service
    await registry.services.addServices(agentRegistry);
    
    // The registry is now available for other components to use
    console.log("[agent] Started agent service");
  },
  
  // Tools exposed by this package
  tools: {
    runAgent,
    listAgents,
  },
};

export default pkg;