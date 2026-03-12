import TokenRingApp from "@tokenring-ai/app";
import omit from "@tokenring-ai/utility/object/omit";
import {createRPCEndpoint} from "@tokenring-ai/rpc/createRPCEndpoint";
import Agent from "../Agent.ts";
import AgentManager from "../services/AgentManager.js";
import {AgentEventState} from "../state/agentEventState.js";
import {CommandHistoryState} from "../state/commandHistoryState.ts";
import AgentRpcSchema from "./schema.ts";
import AgentCommandService from "../services/AgentCommandService.ts";

export default createRPCEndpoint(AgentRpcSchema, {
  getAgent(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    return {
      id: agent.id,
      displayName: agent.displayName,
      description: agent.config.description,
      debugEnabled: agent.config.debug,
      config: omit(agent.config, ["workHandler"]),
    };
  },

  getAgentEvents(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const state = agent.getState(AgentEventState);
    return {
      events: state.events.slice(args.fromPosition),
      position: state.events.length
    };
  },

  async * streamAgentEvents(args, app, signal) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");

    let position = args.fromPosition;

    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      let events = state.events.slice(position);
      position = state.events.length;
      yield {
        events,
        position
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
    return app.requireService(AgentManager).getAgents().map((agent: Agent) => {
      const agentState = agent.getState(AgentEventState);


      return {
        id: agent.id,
        displayName: agent.displayName,
        description: agent.config.description,
        idle: agentState.idle,
        statusMessage:
          agentState.status === 'starting' ? "Agent starting..."
          : agentState.status === 'stopping' ? "Agent stopping..."
          : agentState.status === 'stopped' ? "Agent stopped"
          : agentState.inputQueue.length === 0 ? "Agent is idle" :
            agentState.currentlyExecutingInputItem
            ? agentState.currentlyExecutingInputItem.executionState.currentActivity
            : "Agent is working"
      }
    });
  },

  getAgentTypes(_args, app) {
    const configs = app.requireService(AgentManager).getAgentConfigEntries();
    return configs.map(([type, config]) => ({
      type,
      displayName: config.displayName,
      description: config.description,
      category: config.category,
      callable: config.callable,
    }));
  },

  async createAgent(args, app) {
    const agent = await app.requireService(AgentManager).spawnAgent({
      agentType: args.agentType,
      headless: args.headless,
    });
    return {
      id: agent.id,
      displayName: agent.displayName,
      description: agent.config.description,
    };
  },

  async deleteAgent(args, app) {
    await app.requireService(AgentManager).deleteAgent(args.agentId, args.reason);
    return { success: true };
  },

  sendInput(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const requestId = agent.handleInput(args.input)
    return { requestId };
  },

  sendInteractionResponse(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    agent.sendInteractionResponse(args.response);
    return { success: true };
  },

  abortCurrentOperation(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    agent.abortCurrentOperation(args.message);
    return { success: true };
  },

  getCommandHistory(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    return agent.getState(CommandHistoryState).commands;
  },

  getAvailableCommands(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    return agent.requireServiceByType(AgentCommandService).getCommandNames();
  }
});
