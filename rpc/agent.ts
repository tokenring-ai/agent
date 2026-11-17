import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import AgentDirectoryService from "../AgentDirectoryService.ts";
import type { InstallSource } from "../schema.ts";
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

    // End the stream when the agent is deleted, not only when the client goes
    // away: `agentNotFound` is only yielded to a NEW subscription, so a stream
    // left open across deletion would keep a viewing client stale instead of
    // letting it flip to its not-running (restore) state.
    const controller = new AbortController();
    const onClientAbort = () => controller.abort(signal.reason);
    const onAgentShutdown = () => controller.abort();
    if (signal.aborted) onClientAbort();
    else signal.addEventListener("abort", onClientAbort);
    agent.agentShutdownSignal.addEventListener("abort", onAgentShutdown);

    try {
      for await (const state of agent.subscribeStateAsync(AgentEventState, controller.signal)) {
        const events = state.events.slice(position);
        position = state.events.length;
        yield {
          status: "success",
          events,
          position,
        };
      }
    } finally {
      signal.removeEventListener("abort", onClientAbort);
      agent.agentShutdownSignal.removeEventListener("abort", onAgentShutdown);
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
    const agentManager = app.requireService(AgentManager);
    return agentManager.getAgentConfigEntries().map(([type, config]) => {
      const loose = config as Record<string, unknown>;
      const chat = loose.chat as { enabledTools?: string[] } | undefined;
      const enabledTools = Array.isArray(chat?.enabledTools) ? chat.enabledTools : [];
      const installedFrom = loose.installedFrom as InstallSource | undefined;
      return {
        type,
        displayName: config.displayName,
        description: config.description,
        category: config.category,
        enabledTools,
        source: agentManager.getAgentSource(type) ?? "bundled",
        ...(installedFrom ? { installedFrom } : {}),
      };
    });
  },

  getAgentDirectory(_args, app) {
    return { directory: app.requireService(AgentDirectoryService).getAgentDirectory() };
  },

  async listAgentDefinitions(_args, app) {
    return app.requireService(AgentDirectoryService).listAgentDefinitions();
  },

  async getAgentTypeDetail(args, app) {
    const source = app.requireService(AgentManager).getAgentSource(args.type);
    if (!source) {
      return { status: "agentTypeNotFound" as const };
    }

    if (source === "workspace") {
      const definition = await app.requireService(AgentDirectoryService).getAgentDefinition(args.type);
      // The file can disappear between the registry lookup and this read.
      if (definition) {
        const { name: _name, updatedAt, ...agent } = definition;
        return { status: "success" as const, source, agent, updatedAt };
      }
    }

    // Bundled types have no file on disk — hand back the running config so it can be cloned.
    const { agentType: _agentType, ...agent } = app.requireService(AgentManager).requireAgentConfig(args.type);
    return { status: "success" as const, source, agent, updatedAt: null };
  },

  async createAgentDefinition(args, app) {
    const agent = await app.requireService(AgentDirectoryService).createAgentDefinition(args.name, args.agent);
    return { agent };
  },

  async updateAgentDefinition(args, app) {
    const agent = await app.requireService(AgentDirectoryService).updateAgentDefinition(args.name, args.agent);
    return { agent };
  },

  async deleteAgentDefinition(args, app) {
    const success = await app.requireService(AgentDirectoryService).deleteAgentDefinition(args.name);
    return { success };
  },

  createAgent(args, app) {
    // Started from the app: its questions wait for a person unless the caller says nobody will watch it.
    const agent = app.requireService(AgentManager).spawnAgent({ agentType: args.agentType, answerTimeoutSeconds: args.answerTimeoutSeconds ?? null });
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

  branchAgent(args, app) {
    const agentManager = app.requireService(AgentManager);
    const agent = agentManager.getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const branch = agentManager.branchAgent(agent, args.at);
    return { status: "success", agentId: branch.id, agentName: branch.displayName };
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

  cancelInput(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    // Also covers an input whose hooks are still running, which is not in the queue yet.
    agent.cancelInput(args.requestId);
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
