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
  positionals: [{
    name: "message",
    description: "The message to send to the agent",
    required: true,
    greedy: true
  }],
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({positionals, args, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const isBg = args["--bg"] === true;
  const agentType = args["--type"];

  await runSubAgent({
    agentType,
    background: isBg,
    headless: agent.headless,
    input: {
      from: "Parent agent command: /agent run",
      message: `/work ${positionals.message}`,
    }
  }, agent, true);

  return isBg ? "Agent started in background." : "Sub-agent completed successfully.";
}

const command = {
  name: "agent run",
  description: "Run an agent with a message",
  inputSchema,
  execute,
  help: `Runs an agent of the specified type with the given message.

### Examples
/agent run --type leader analyze the codebase
/agent run --bg --type researcher find information about AI`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

export default command;
