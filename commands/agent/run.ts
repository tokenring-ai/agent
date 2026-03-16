import {CommandFailedError} from "../../AgentError.ts";
import {runSubAgent} from "../../runSubAgent.ts";
import {
  AgentCommandInputSchema,
  AgentCommandInputType,
  TokenRingAgentCommand,
} from "../../types.ts";
import {formatAgentCommandUsageError} from "../../util/formatAgentCommandUsage.ts";

const inputSchema = {
  args: {
    "--bg": {
      type: "flag",
      description: "Run the agent in the background without forwarding output",
    },
    "--type": {
      type: "string",
      description: "The type of agent to run",
      required: true,
    },
  },
  prompt: {
    description: "The message to send to the agent",
    required: true,
  },
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({prompt, args, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const isBg = args["--bg"] === true;
  const parts = prompt.split(/\s+/);
  const agentType = args["--type"];
  const message = parts.slice(1).join(" ");

  if (!message) {
    throw new CommandFailedError(
      formatAgentCommandUsageError(command, "Please provide a message for the agent"),
    );
  }

  await runSubAgent({
    agentType,
    background: isBg,
    headless: agent.headless,
    input: {
      from: "Parent agent command: /agent run",
      message: `/work ${message}`,
    }
  }, agent, true);

  return isBg ? "Agent started in background." : "Sub-agent completed successfully.";
}

const command = {
  name: "agent run",
  description: "Run an agent with a message",
  inputSchema,
  execute,
  help: `## /agent run [--bg] --type <agentType> <message>

Runs an agent of the specified type with the given message.
- Use --bg flag to run in background without forwarding output

### Examples
/agent run --type leader analyze the codebase
/agent run --bg --type researcher find information about AI`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

export default command;
