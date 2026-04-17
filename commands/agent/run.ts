import {AgentLifecycleService} from "@tokenring-ai/lifecycle";
import {CommandFailedError} from "../../AgentError.ts";
import {AfterSubAgentResponse} from "../../hooks.ts";
import {type RunSubAgentOptions, SubAgentService} from "../../index.ts";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "../../types.ts";

const inputSchema = {
  args: {
    "bg": {
      type: "flag",
      description: "Run the agent in the background without forwarding output",
    },
    "type": {
      type: "string",
      description: "The type of agent to run",
      required: true,
    },
    "forwardChatOutput": {
      type: "flag",
      description: "Forward chat output from the sub-agent",
    },
    "noStatusMessages": {
      type: "flag",
      description: "Do not forward status messages from the sub-agent",
    },
    "forwardSystemOutput": {
      type: "flag",
      description: "Forward system output from the sub-agent",
    },
    "noHumanRequests": {
      type: "flag",
      description: "Do not forward human requests from the sub-agent",
    },
    "forwardReasoning": {
      type: "flag",
      description: "Forward reasoning output from the sub-agent",
    },
    "noInputCommands": {
      type: "flag",
      description: "Do not forward input commands from the sub-agent",
    },
    "forwardArtifacts": {
      type: "flag",
      description: "Forward artifacts from the sub-agent",
    },
    "timeout": {
      type: "number",
      description: "Timeout in milliseconds for the sub-agent (0 = no timeout)",
      defaultValue: 0,
    },
    "maxResponseLength": {
      type: "number",
      description: "Maximum response length from the sub-agent",
      defaultValue: 10000,
    },
    "minContextLength": {
      type: "number",
      description: "Minimum context length for the sub-agent",
      defaultValue: 1000,
    },
    "neverFail": {
      type: "flag",
      description: "Ignore errors from the sub-agent, printing them as warnings instead of failing the command",
    },
  },
  remainder: {
    name: "message",
    description: "The message to send to the agent",
    required: true,
  },
} as const satisfies AgentCommandInputSchema;

async function execute({
                         remainder,
                         args,
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const isBg = args.bg === true;
  const agentType = args.type;

  const subAgentOptions = {
    forwardChatOutput: !!args.forwardChatOutput,
    forwardStatusMessages: !args.noStatusMessages,
    forwardSystemOutput: !!args.forwardSystemOutput,
    forwardHumanRequests: !args.noHumanRequests,
    forwardReasoning: !!args.forwardReasoning,
    forwardInputCommands: !args.noInputCommands,
    forwardArtifacts: !!args.forwardArtifacts,
    timeout: args.timeout,
    maxResponseLength: args.maxResponseLength,
    minContextLength: args.minContextLength,
  };

  const subAgentService = agent.requireServiceByType(SubAgentService);

  const request: RunSubAgentOptions = {
    agentType,
    background: isBg,
    headless: agent.headless,
    from: "Parent agent command: /agent run",
    steps: [remainder],
    parentAgent: agent,
    autoCleanup: true,
    options: subAgentOptions,
  };
  const result = await subAgentService.runSubAgent(request);

  const lifecycleService = agent.getServiceByType(AgentLifecycleService);
  await lifecycleService?.executeHooks(
    new AfterSubAgentResponse(request, result),
    agent,
  );

  if (isBg) {
    return `Agent ${agentType} started in background.`;
  }

  if (result.status === "success" || args.neverFail) {
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
