import {AgentLifecycleService} from "@tokenring-ai/lifecycle";
import interpolateString from "@tokenring-ai/utility/string/interpolateString";
import {CommandFailedError} from "../AgentError.ts";
import {AfterSubAgentResponse} from "../hooks.ts";
import {SubAgentService} from "../index.ts";

/**
 * Register an agent as a callable command
 */
import type {AgentCommandConfig, ParsedAgentConfig} from "../schema.ts";
import type {RunSubAgentOptions} from "../services/SubAgentService.ts";
import type {AgentCommandInputType, TokenRingAgentCommand} from "../types.ts";

export function createAgentCommand(name: string, commandConfig: AgentCommandConfig, config: ParsedAgentConfig): TokenRingAgentCommand<any> {
  const description = `${commandConfig.description || config.description}`;

  return {
    name,
    description,
    inputSchema: commandConfig.commandSchema,
    execute: async (args: AgentCommandInputType<typeof commandConfig.commandSchema>): Promise<string> => {
      const {agent} = args;
      const replacements: Record<string, () => string> = {};
      if (commandConfig.commandSchema.remainder) {
        replacements[commandConfig.commandSchema.remainder.name] = () => args.remainder ?? "undefined";
      }

      const steps = commandConfig.steps.map(step => interpolateString(step, replacements));

      const subAgentService = agent.requireServiceByType(SubAgentService);
      const request: RunSubAgentOptions = {
        agentType: config.agentType,
        background: commandConfig.background,
        headless: agent.headless,
        from: `Parent agent command: /${name}`,
        steps,
        parentAgent: agent,
        options: {
          forwardChatOutput: commandConfig.forwardChatOutput,
          forwardSystemOutput: commandConfig.forwardSystemOutput,
          forwardHumanRequests: commandConfig.forwardHumanRequests,
          forwardReasoning: commandConfig.forwardReasoning,
          forwardInputCommands: commandConfig.forwardInputCommands,
          forwardArtifacts: commandConfig.forwardArtifacts,
        },
        checkPermissions: false
      };

      const result = await subAgentService.runSubAgent(request);

      if (commandConfig.background) {
        return `Agent ${config.agentType} started in background.`;
      }

      const lifecycleService = agent.getServiceByType(AgentLifecycleService);
      lifecycleService?.executeHooks(new AfterSubAgentResponse(request, result), agent);

      if (result.status === "success") {
        return result.response || "Agent completed successfully.";
      } else if (result.status === "cancelled") {
        throw new CommandFailedError(`Agent was cancelled: ${result.response}`);
      } else {
        throw new CommandFailedError(`Agent error: ${result.response}`);
      }
    },
    help: commandConfig.help ?? `${description}

## Usage
/${name} <${commandConfig.commandSchema.remainder.name}>

Runs the "${config.agentType}" agent with the provided message.
`.trim()
  };
}