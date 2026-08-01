import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import AgentCommandService from "../services/AgentCommandService.ts";
import AgentManager from "../services/AgentManager.ts";
import { AgentEventState } from "../state/agentEventState.ts";
import { CommandHistoryState } from "../state/commandHistoryState.ts";
import { projectAgentList } from "../util/projectAgentList.ts";
import AgentRpcSchema, { type AvailableAgentCommand } from "./schema.ts";

export default createRPCEndpoint(AgentRpcSchema, {
  getAgentConfig(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }
    return { status: "success", ...agent.config };
  },

  getAgentEvents(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const state = agent.getState(AgentEventState);
    return {
      status: "success",
      events: state.events.slice(args.fromPosition),
      position: state.events.length,
    };
  },

  async *streamAgentEvents(args, app, signal) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      yield { status: "agentNotFound" };
      return;
    }

    let position = args.fromPosition;

    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      const events = state.events.slice(position);
      position = state.events.length;
      yield {
        status: "success",
        events,
        position,
      };
    }
  },

  listAgents(_args, app) {
    return projectAgentList(app.requireService(AgentManager).getAgents());
  },

  async *streamAgents(_args, app, signal) {
    const manager = app.requireService(AgentManager);
    for await (const agents of manager.subscribeAgentsAsync(signal)) {
      yield agents;
    }
  },

  getAgentTypes(_args, app) {
    const configs = app.requireService(AgentManager).getAgentConfigEntries();
    return configs.map(([type, config]) => {
      const chat = (config as Record<string, unknown>).chat as { enabledTools?: string[] } | undefined;
      const enabledTools = Array.isArray(chat?.enabledTools) ? chat.enabledTools : [];
      return {
        type,
        displayName: config.displayName,
        description: config.description,
        category: config.category,
        enabledTools,
      };
    });
  },

  createAgent(args, app) {
    const agent = app.requireService(AgentManager).spawnAgent({
      agentType: args.agentType,
      headless: args.headless,
    });
    return {
      id: agent.id,
      displayName: agent.displayName,
      description: agent.config.description,
    };
  },

  deleteAgent(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    app.requireService(AgentManager).deleteAgent(agent.id, args.reason);
    return { status: "success" };
  },

  sendInput(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const requestId = agent.handleInput(args.input);
    return {
      status: "success",
      requestId,
    };
  },

  sendInteractionResponse(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    agent.sendInteractionResponse(args.response);
    return { status: "success" };
  },

  abortCurrentOperation(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    agent.abortCurrentOperation(args.message);
    return { status: "success" };
  },

  getCommandHistory(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }
    return {
      status: "success",
      history: agent.getState(CommandHistoryState).commands,
    };
  },

  getAvailableCommands(args, app) {
    let commandService: AgentCommandService;
    if (args.agentId) {
      const agent = app.requireService(AgentManager).getAgent(args.agentId);
      if (!agent) {
        return { status: "agentNotFound" };
      }
      commandService = agent.requireService(AgentCommandService);
    } else {
      commandService = app.requireService(AgentCommandService);
    }

    const uniqueCommands = new EnhancedMap<string, AvailableAgentCommand>();
    for (const [, command] of commandService.getCommandEntries()) {
      uniqueCommands.set(command.name, {
        name: command.name,
        description: command.description,
        inputSchema: command.inputSchema,
      });
    }
    return {
      status: "success",
      commands: uniqueCommands.sortedValues((l, r) => l.name.localeCompare(r.name)),
    };
  },
});
