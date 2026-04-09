import {AgentLifecycleService} from "@tokenring-ai/lifecycle";
import {CommandFailedError} from "../../AgentError.ts";
import {AfterSubAgentResponse} from "../../hooks.ts";
import {type RunSubAgentOptions, SubAgentService} from "../../index.ts";
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

  const request: RunSubAgentOptions = {
    agentType,
    background: isBg,
    headless: agent.headless,
    from: "Parent agent command: /agent run",
    steps: [remainder],
    parentAgent: agent,
    autoCleanup: true,
    checkPermissions: false,
  }
  const result = await subAgentService.runSubAgent(request);

  const lifecycleService = agent.getServiceByType(AgentLifecycleService);
  await lifecycleService?.executeHooks(new AfterSubAgentResponse(request, result), agent);

  if (isBg) {
    return `Agent ${agentType} started in background.`;
  }

  if (result.status === "success") {
    return result.response || "Agent completed successfully.";
  } else if (result.status === "cancelled") {
    throw new CommandFailedError(`Agent was cancelled: ${result.response}`);
  } else {
    throw new CommandFailedError(`Agent error: ${result.response}`);
  }
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
