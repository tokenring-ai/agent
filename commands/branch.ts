import AgentManager from "../services/AgentManager.ts";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "../types.ts";
import { formatAgentId } from "../util/formatAgentId.ts";

const inputSchema = {
  remainder: {
    name: "message",
    description: "Optional message to send to the new agent",
  },
} as const satisfies AgentCommandInputSchema;

function execute({ remainder, agent }: AgentCommandInputType<typeof inputSchema>): string {
  const agentManager = agent.requireService(AgentManager);
  const newAgent = agentManager.branchAgent(agent);

  if (remainder) {
    newAgent.handleInput({
      from: `Branched from agent ${formatAgentId(agent.id)}`,
      message: remainder,
    });
  }

  return `A new agent has been created and can be viewed at: [${newAgent.id}](agent://${newAgent.id})`;
}

export default {
  name: "branch",
  description: "Checkpoint the current agent and start a new agent from that checkpoint",
  inputSchema,
  execute,
  help: `Takes a checkpoint of the current agent and starts a new agent from that checkpoint. Optionally sends a message to the new agent.

## Usage
/branch
/branch <message>

## Examples
/branch
/branch continue investigating the auth bug

The original agent stays running. The new agent is a full copy of the current agent's state at the moment of the branch.`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
