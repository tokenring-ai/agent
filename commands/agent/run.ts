import {SubAgentService} from "../../index.ts";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../../types.ts";

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
  remainder: {
    name: "message",
    description: "The message to send to the agent",
    required: true,
  }
} as const satisfies AgentCommandInputSchema;

async function execute({remainder, args, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const isBg = args["--bg"] === true;
  const agentType = args["--type"];

  const subAgentService = agent.requireServiceByType(SubAgentService);

  await subAgentService.runSubAgent({
    agentType,
    background: isBg,
    headless: agent.headless,
    input: {
      from: "Parent agent command: /agent run",
      message: `/work ${remainder}`,
    },
    parentAgent: agent,
    autoCleanup: true
  });

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
