import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import interpolateString from "@tokenring-ai/utility/string/interpolateString";
import { CommandFailedError } from "../AgentError.ts";
import { AfterSubAgentResponse } from "../hooks.ts";
import type { ParsedAgentCommandConfig } from "../schema.ts";
import AgentCommandService from "../services/AgentCommandService.ts";
import type { AgentCommandInputType, TokenRingAgentCommand, TokenRingAgentCommandResult } from "../types.ts";
import type { RunSubAgentOptions } from "./runSubAgent.ts";
import { runSubAgent } from "./runSubAgent.ts";

/**
 * Register an agent as a callable command.
 *
 * When `requireNewAgent` is false (default) and the invoking agent already has
 * the same `agentType` as the command, steps run in-place via `/chat send`.
 * Otherwise a new agent of the target type is spawned (background by default
 * when types differ so the parent is not blocked).
 */
export function createAgentCommand(name: string, commandConfig: ParsedAgentCommandConfig): TokenRingAgentCommand<any> {
  return {
    name,
    description: commandConfig.description,
    inputSchema: commandConfig.commandSchema,
    execute: async (args: AgentCommandInputType<typeof commandConfig.commandSchema>): Promise<string> => {
      const { agent } = args;
      const replacements: Record<string, () => string> = {};
      replacements[commandConfig.commandSchema.remainder.name] = () => args.remainder ?? "undefined";

      const steps = commandConfig.steps.map(step => interpolateString(step, replacements));

      const canRunInPlace = !commandConfig.requireNewAgent && agent.config.agentType === commandConfig.agentType;

      if (canRunInPlace) {
        const commandService = agent.requireService(AgentCommandService);
        let lastMessage = "Agent completed successfully.";

        for (const step of steps) {
          const result: TokenRingAgentCommandResult = await commandService.executeAgentCommand(agent, `/chat send ${step}`, args.attachments);
          if (typeof result === "string") {
            lastMessage = result;
          } else if (result.message) {
            lastMessage = result.message;
          }
        }

        return lastMessage;
      }

      // Type mismatch or requireNewAgent: dispatch to a dedicated agent.
      // Prefer background when spawning from a different agent type so the parent is not blocked.
      const useBackground = commandConfig.requireNewAgent ? commandConfig.background : true;

      const request: RunSubAgentOptions = {
        agentType: commandConfig.agentType,
        background: useBackground,
        headless: agent.headless,
        from: `Parent agent command: /${name}`,
        steps,
        parentAgent: agent,
        options: commandConfig.subAgent,
      };

      const result = await runSubAgent(request);

      if (useBackground) {
        return `Agent ${commandConfig.agentType} started in background.`;
      }

      const lifecycleService = agent.getService(AgentLifecycleService);
      await lifecycleService?.executeHooks(new AfterSubAgentResponse(request, result), agent);

      if (result.status === "success") {
        return result.response || "Agent completed successfully.";
      } else if (result.status === "cancelled") {
        throw new CommandFailedError(`Agent was cancelled: ${result.response}`);
      } else {
        throw new CommandFailedError(`Agent error: ${result.response}`);
      }
    },
    help:
      commandConfig.help ??
      `${commandConfig.description}

## Usage
/${name} <${commandConfig.commandSchema.remainder.name}>

Runs the "${commandConfig.agentType}" agent with the provided message.
`.trim(),
  };
}
