import markdownList from "@tokenring-ai/utility/string/markdownList";
import type Agent from "../Agent.ts";
import {CommandFailedError} from "../AgentError.ts";
import AgentCommandService from "../services/AgentCommandService.ts";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../types.ts";

const description = "Show this help message" as const;
const inputSchema = {
  remainder: {
    name: "command",
    description: "Optional command name to show help for",
  },
} as const satisfies AgentCommandInputSchema;

function execute({
                   remainder,
                   agent,
                 }: AgentCommandInputType<typeof inputSchema>): string {
  const command = remainder;
  if (command) {
    return getHelpOnCommand(command, agent);
  }

  const agentCommandService = agent.requireServiceByType(AgentCommandService);
  const commands = agentCommandService.getCommandEntries();

  const lines = [
    "**Available chat commands:**",
    markdownList(
      Array.from(commands)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(
          ([_cmdName, command]) => `/${command.name} - ${command.description}`,
        ),
    ),
  ];

  lines.push(
    "",
    "Use /help <command> to get detailed help for a specific command.",
  );

  return lines.join("\n");
}

function getHelpOnCommand(command: string, agent: Agent): string {
  const agentCommandService = agent.requireServiceByType(AgentCommandService);
  const commandInfo = agentCommandService.getCommand(command);
  if (commandInfo) {
    return commandInfo.help.trim();
  } else {
    throw new CommandFailedError(`No help available for command /${command}`);
  }
}

const help = `Displays detailed help information for all available commands. Each command shows its usage, description, and examples when available.

## Output

- Lists all available commands with their descriptions
- Shows detailed help for commands that have extended help text  
- Provides usage examples and tips where applicable

## Examples

/help                   # Show help for all commands
/help multi            # Show help for multi command (if implemented)

> **Note:** This command is always available and provides the most comprehensive overview of what you can do in the CLI interface.`;

export default {
  name: "help",
  description,
  inputSchema,
  execute,
  help,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
