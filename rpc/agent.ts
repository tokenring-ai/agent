import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import type Agent from "../Agent.ts";
import AgentCommandService from "../services/AgentCommandService.ts";
import AgentManager from "../services/AgentManager.ts";
import { AgentEventState } from "../state/agentEventState.ts";
import { CommandHistoryState } from "../state/commandHistoryState.ts";
import AgentRpcSchema from "./schema.ts";

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
  /*
  getAgentExecutionState(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const state = agent.getState(AgentEventState);
    return {
      idle: state.idle,
      busyWith: state.latestExecutionState.busyWith,
      waitingOn: state.latestExecutionState.waitingOn,
    };
  },

  async * streamAgentExecutionState(args, app, signal) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");

    let lastExecutionState: z.output<typeof AgentExecutionStateSchema> | null = null;
    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      if (state.latestExecutionState === lastExecutionState) continue;
      yield {
        idle: state.idle,
        busyWith: state.latestExecutionState.busyWith,
        waitingOn: state.latestExecutionState.waitingOn,
      };
      lastExecutionState = state.latestExecutionState;
    }
  },*/
  listAgents(_args, app) {
    return app
      .requireService(AgentManager)
      .getAgents()
      .map((agent: Agent) => {
        const agentState = agent.getState(AgentEventState);

        return {
          id: agent.id,
          displayName: agent.displayName,
          description: agent.config.description,
          idle: agentState.idle,
          currentActivity: agentState.currentActivity,
        };
      });
  },

  getAgentTypes(_args, app) {
    const configs = app.requireService(AgentManager).getAgentConfigEntries();
    return configs.map(([type, config]) => ({
      type,
      displayName: config.displayName,
      description: config.description,
      category: config.category,
    }));
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
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }
    return {
      status: "success",
      commands: agent.requireServiceByType(AgentCommandService).getCommandNames(),
    };
  },
});
