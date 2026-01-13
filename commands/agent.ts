import Agent from "../Agent.ts";
import {TokenRingAgentCommand} from "../types.ts";
import createSubcommandRouter from "../util/subcommandRouter.ts";
import AgentManager from "../services/AgentManager.ts";
import {runSubAgent} from "../runSubAgent.ts";

const description = "/agent - Manage and interact with agents" as const;

async function types(remainder: string, agent: Agent): Promise<void> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const configs = agentManager.getAgentConfigs();
  
  agent.chatOutput("**Available agent types:**\n" + 
    Object.entries(configs)
      .map(([type, config]) => `- **${type}**: ${config.description}`)
      .join("\n")
  );
}

async function list(remainder: string, agent: Agent): Promise<void> {
  const agentManager = agent.requireServiceByType(AgentManager);
  const agents = agentManager.getAgents();
  
  if (agents.length === 0) {
    agent.chatOutput("No running agents.");
    return;
  }
  
  agent.chatOutput("**Running agents:**\n" + 
    agents.map(a => `- **${a.name}** (${a.id.slice(0, 8)}): ${a.config.description}`)
      .join("\n")
  );
}

async function run(remainder: string, agent: Agent): Promise<void> {
  const isBg = remainder.includes("--bg");
  const input = remainder.replace("--bg", "").trim();
  
  if (!input) {
    agent.errorLine("Usage: /agent run [--bg] <agentType> <message>");
    return;
  }
  
  const parts = input.split(/\s+/);
  const agentType = parts[0];
  const message = parts.slice(1).join(" ");
  
  if (!message) {
    agent.errorLine("Please provide a message for the agent");
    return;
  }
  
  const result = await runSubAgent({
    agentType,
    background: isBg,
    headless: agent.headless,
    command: `/work ${message}`,
    forwardChatOutput: true,
    forwardSystemOutput: true,
    forwardHumanRequests: true,
    forwardReasoning: true,
  }, agent, true);

  if (isBg) {
    agent.chatOutput(`Agent started in background.`);
  }
}
async function shutdown(remainder: string, agent: Agent): Promise<void> {
  const id = remainder.trim() || agent.id;

  const agentManager = agent.requireServiceByType(AgentManager);

  const agentToShutdown = agentManager.getAgent(id);
  if (! agentToShutdown) {
    agent.errorLine(`Agent ${id} not found`);
    return;
  }

  agent.shutdown("Agent was shut down with /agent shutdown command");
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
