import Agent from "../../Agent.ts";
import AgentManager from "../../services/AgentManager.ts";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const id = remainder.trim() || agent.id;
  const agentManager = agent.requireServiceByType(AgentManager);

  await agentManager.deleteAgent(id, "Agent was shut down with /agent shutdown command");
  return `Agent ${id} shut down.`;
}

export default {
  name: "agent shutdown",
  description: "Shut down an agent",
  execute,
  help: `## /agent shutdown [id]

Shuts down the current agent, or the agent with the given id.

### Examples
/agent shutdown
/agent shutdown <id>`,
} satisfies TokenRingAgentCommand;
