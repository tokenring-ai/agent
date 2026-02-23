import Agent from "../Agent.ts";
import {CommandFailedError} from "../AgentError.ts";
import {runSubAgent} from "../runSubAgent.ts";
import AgentManager from "../services/AgentManager.ts";
import {TokenRingAgentCommand} from "../types.ts";
import createSubcommandRouter from "../util/subcommandRouter.ts";

const description = "/agent - Manage and interact with agents" as const;

async function types(remainder: string, agent: Agent): Promise<string> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const configs = agentManager.getAgentConfigEntries();
  
  return "**Available agent types:**\n" +
    Array.from(configs)
      .map(([type, config]) => `- **${type}**: ${config.description}`)
      .join("\n");
}

async function list(remainder: string, agent: Agent): Promise<string> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const agents = agentManager.getAgents();
  
  if (agents.length === 0) {
    return "No running agents.";
  }

  return "**Running agents:**\n" +
    agents.map(a => `- **${a.name}** (${a.id.slice(0, 8)}): ${a.config.description}`)
      .join("\n");
}

async function run(remainder: string, agent: Agent): Promise<string> {
  const isBg = remainder.includes("--bg");
  const input = remainder.replace("--bg", "").trim();
  
  if (!input) {
    throw new CommandFailedError("Usage: /agent run [--bg] <agentType> <message>");
  }
  
  const parts = input.split(/\s+/);
  const agentType = parts[0];
  const message = parts.slice(1).join(" ");
  
  if (!message) {
    throw new CommandFailedError("Please provide a message for the agent");
  }
  
  const result = await runSubAgent({
    agentType,
    background: isBg,
    headless: agent.headless,
    command: `/work ${message}`,
  }, agent, true);

  if (isBg) {
    return `Agent started in background.`;
  } else {
    return "Sub-agent completed successfully.";
  }
}
async function shutdown(remainder: string, agent: Agent): Promise<string> {
  const id = remainder.trim() || agent.id;

  const agentManager = agent.requireServiceByType(AgentManager);

  await agentManager.deleteAgent(id, "Agent was shut down with /agent shutdown command");
  return `Agent ${id} shut down.`;
}

const execute = createSubcommandRouter({
  types,
  list,
  run,
  shutdown
});

const help = `# /agent

## Description
Manage and interact with agents in the system.

## Subcommands

### /agent types
Lists all available agent types with their descriptions.

### /agent list
Lists all currently running agents.

### /agent shutdown
Shuts down the current agent

### /agent shutdown <id>
Shuts down the agent with id <id>

### /agent run [--bg] <agentType> <message>
Runs an agent of the specified type with the given message.
- Use --bg flag to run in background without forwarding output

## Examples
/agent types
/agent list
/agent run teamLeader analyze the codebase
/agent run --bg researcher find information about AI`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;
