import Agent from "../Agent.ts";
import AgentCommandService from "../services/AgentCommandService.ts";
import {TokenRingAgentCommand} from "../types.ts";

const description = "/help - Show this help message" as const;

async function execute(remainder: string, agent: Agent): Promise<void> {
  const command = remainder?.trim();
  if (command) {
    return getHelpOnCommand(command, agent);
  }

  const agentCommandService = agent.requireServiceByType(AgentCommandService);
  const commands = agentCommandService.getCommands();

  const lines = ["**Available chat commands:**"];

  for (const cmdName of Object.keys(commands).sort()) {
    lines.push(`- ${commands[cmdName].description}`);
  }

  lines.push(
    "",
    "Use /help <command> to get detailed help for a specific command.",
    "Type /<command> to run. Use /quit or /exit to return to agent selection.",
    "Multi-line entry: Type :paste to enter multi-line mode, type :end on a new line to finish.",
  );
  agent.chatOutput(lines.join("\n"));
}

function getHelpOnCommand(command: string, agent: Agent): void {
  const agentCommandService = agent.requireServiceByType(AgentCommandService);
  const commandInfo = agentCommandService.getCommand(command);
  if (commandInfo) {
    agent.chatOutput(commandInfo.help.trim());
  } else {
    agent.chatOutput(`No help available for command /${command}`);
  }
}

const help = `# /help

Displays help information for available commands.

## Description

Displays detailed help information for all available commands. Each command shows its usage, description, and examples when available.

## Usage

/help

## Output

- Lists all available commands with their descriptions
- Shows detailed help for commands that have extended help text  
- Provides usage examples and tips where applicable

## Examples

/help                   # Show help for all commands
/help multi            # Show help for multi command (if implemented)

> **Note:** This command is always available and provides the most comprehensive overview of what you can do in the CLI interface.`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;