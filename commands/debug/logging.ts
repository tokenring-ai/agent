import {CommandFailedError} from "../../AgentError.ts";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../../types.ts";
import {formatAgentCommandUsageError} from "../../util/formatAgentCommandUsage.ts";

const inputSchema = {
  positionals: [
    {
      name: 'enabled',
      description: "Use 'on' or 'off' to control debug logging",
      required: true,
    },
  ]
} as const satisfies AgentCommandInputSchema;

async function execute({positionals, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const enabled = positionals.enabled;

  if (enabled === "on") {
    agent.debugEnabled = true;
    return "Debug logging enabled";
  } else if (enabled === "off") {
    agent.debugEnabled = false;
    return "Debug logging disabled";
  } else {
    throw new CommandFailedError(
      formatAgentCommandUsageError(command, `Invalid argument: ${enabled}. Use 'on' or 'off'`),
    );
  }
}

const command = {
  name: "debug logging",
  description: "Enable or disable debug logging",
  inputSchema,
  execute,
  help: "Enable or disable debug logging output.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;

export default command;
