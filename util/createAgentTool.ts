import {type TokenRingToolDefinition} from "@tokenring-ai/chat";
import {AgentLifecycleService} from "@tokenring-ai/lifecycle";
import interpolateString from "@tokenring-ai/utility/string/interpolateString";
import {z} from "zod";
import {CommandFailedError} from "../AgentError.ts";
import {AfterSubAgentResponse} from "../hooks.ts";
import {SubAgentService} from "../index.ts";

/**
 * Register an agent as a callable tool
 */
import {type AgentToolConfig, ParsedAgentConfig} from "../schema.ts";
import type {RunSubAgentOptions} from "../services/SubAgentService.ts";
import {SubAgentState} from "../state/subAgentState.ts";

export function createAgentTool(toolName: string, toolConfig: AgentToolConfig, config: ParsedAgentConfig) {
  const toolDescription = `${toolConfig.description || config.description}`;
  const inputSchemaEntries = Object.entries(toolConfig.inputArguments).map(([name, arg]) => ([
    name,
    arg.defaultValue ? z.string().describe(arg.description).default(arg.defaultValue) : z.string().describe(arg.description)
  ]));

  const inputSchema = z.object(Object.fromEntries(inputSchemaEntries));

  const toolDefinition: TokenRingToolDefinition<typeof inputSchema> = {
    name: toolName,
    displayName: toolConfig.displayName,
    description: toolDescription,
    inputSchema,
    adjustActivation: (enabled, agent) => {
      if (enabled) {
        const allowedSubAgents = agent.getState(SubAgentState).config.allowedSubAgents;

        if (! allowedSubAgents.includes(config.agentType)) {
          agent.warningMessage(`De-activated tool ${toolName} because it is not an allowed sub-agent for the ${agent.config.agentType} agent.`);
          return false;
        }
      }
      return enabled;
    },
    execute: async (args, agent): Promise<string> => {
      const replacements: Record<string, () => string> = {};
      for (const key of Object.keys(toolConfig.inputArguments)) {
        replacements[key] = () => args[key] as string ?? "undefined"
      }

      const steps = toolConfig.steps.map(step => interpolateString(step, replacements));

      const subAgentService = agent.requireServiceByType(SubAgentService);
      const request: RunSubAgentOptions = {
        agentType: config.agentType,
        background: false,
        headless: agent.headless,
        from: `Parent agent tool: /${toolName}`,
        steps,
        parentAgent: agent,
        options: {
          forwardChatOutput: toolConfig.forwardChatOutput,
          forwardSystemOutput: toolConfig.forwardSystemOutput,
          forwardHumanRequests: toolConfig.forwardHumanRequests,
          forwardReasoning: toolConfig.forwardReasoning,
          forwardInputCommands: toolConfig.forwardInputCommands,
          forwardArtifacts: toolConfig.forwardArtifacts,
        },
      };

      const result = await subAgentService.runSubAgent(request);

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
  };

  return toolDefinition;
}