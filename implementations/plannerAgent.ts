import {Registry} from "@token-ring/registry";
import {execute as runChat} from "@token-ring/ai-client/runChat";
import AgentRegistry from "../AgentRegistry.ts";

/**
 * Planner agent that determines which agents to use for a given task
 * @param input The task to plan for
 * @param registry The application registry
 */
export async function plannerAgent(input: string, registry: Registry) {
  const agentRegistry = registry.requireFirstServiceByType(AgentRegistry);
  const availableAgents = agentRegistry.list();
  
  // First, plan which agents to use
  const result = await runChat({
    input: `Task: ${input}\n\nAvailable agents: ${availableAgents.join(", ")}\n\nPlease analyze this task and determine which agent(s) would be best suited to handle it. Provide a step-by-step plan for using these agents.`,
    systemPrompt: "You are a planning agent that determines the best approach to solving complex tasks by coordinating specialized agents.",
    model: "gpt-4",
  }, registry);
  
  // Extract the plan from the result
  const [planOutput, response] = result;
  
  // The planner could also execute the agents according to the plan
  // This is a simplified example - a real implementation would parse the plan and execute it
  
  return {
    output: `## Task Planning\n\n${planOutput}\n\nTo execute this plan, you can use the runAgent tool with the specified agents.`,
    metadata: {
      plan: planOutput,
      availableAgents,
      usage: response.usage,
      timing: response.timing
    }
  };
}