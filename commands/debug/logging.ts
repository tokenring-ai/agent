import {CommandFailedError} from "../../AgentError.ts";
import {
  AgentCommandInputSchema,
  AgentCommandInputType,
  TokenRingAgentCommand,
} from "../../types.ts";
import {formatAgentCommandUsageError} from "../../util/formatAgentCommandUsage.ts";

const inputSchema = {
  prompt: {
    description: "Use 'on' or 'off' to control debug logging",
    required: true,
  },
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({prompt, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const arg = prompt.trim().toLowerCase();

  if (arg === "on") {
    agent.debugEnabled = true;
    return "Debug logging enabled";
  } else if (arg === "off") {
    agent.debugEnabled = false;
    return "Debug logging disabled";
  } else {
    throw new CommandFailedError(
      formatAgentCommandUsageError(command, `Invalid argument: ${arg}. Use 'on' or 'off'`),
    );
  }
}

const command = {
  name: "debug logging",
  description: "Enable or disable debug logging",
  inputSchema,
  execute,
  help: "## /debug logging on|off\n\nEnable or disable debug logging output.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;

export default command;
