import TokenRingApp from "@tokenring-ai/app";
import {createJsonRPCEndpoint} from "@tokenring-ai/web-host/jsonrpc/createJsonRPCEndpoint";
import Agent from "../Agent.ts";
import {ResetWhat} from "../AgentEvents.ts";
import AgentManager from "../services/AgentManager.js";
import { AgentEventState } from "../state/agentEventState.js";
import {AgentExecutionState} from "../state/agentExecutionState.ts";
import AgentRpcSchema from "./schema.ts";

export default createJsonRPCEndpoint(AgentRpcSchema, {
  getAgent(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    return {
      id: agent.id,
      name: agent.name,
      type: agent.config.type,
      description: agent.config.description,
      debugEnabled: agent.config.debug,
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

    let curPosition = args.fromPosition;

    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      yield {
        events: state.events.slice(curPosition),
        position: state.events.length
      };
      curPosition = state.events.length;
    }
  },

  getAgentExecutionState(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const state = agent.getState(AgentExecutionState);
    return {
      idle: state.idle,
      busyWith: state.busyWith,
      waitingOn: state.waitingOn,
      statusLine: state.statusLine,
    };
  },

  async * streamAgentExecutionState(args, app, signal) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");

    for await (const state of agent.subscribeStateAsync(AgentExecutionState, signal)) {
      yield {
        idle: state.idle,
        busyWith: state.busyWith,
        waitingOn: state.waitingOn,
        statusLine: state.statusLine,
      };
    }
  },
  listAgents(_args, app) {
    return app.requireService(AgentManager).getAgents().map((agent: Agent) => {
      const agentState = agent.getState(AgentExecutionState);

      return {
        id: agent.id,
        name: agent.name,
        type: agent.config.type,
        description: agent.config.description,
        idle: agentState.idle,
        statusMessage: agentState.waitingOn.length > 0
          ? "Waiting on user input..."
          : agentState.idle
            ? "Agent is idle"
            : agentState.busyWith ?? "Agent is working...."
      }
    });
  },

  getAgentTypes(_args, app) {
    const configs = app.requireService(AgentManager).getAgentConfigs();
    return Object.entries(configs).map(([type, config]: [string, any]) => ({
      type,
      name: config.name,
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
      name: agent.config.name,
      type: agent.config.type,
      description: agent.config.description,
    };
  },

  async deleteAgent(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    await app.requireService(AgentManager).deleteAgent(agent);
    return { success: true };
  },

  sendInput(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const requestId = agent.handleInput({ message: args.message });
    return { requestId };
  },

  sendHumanResponse(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    agent.sendHumanResponse(args.requestId, args.response);
    return { success: true };
  },

  abortAgent(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    agent.requestAbort(args.reason);
    return { success: true };
  },

  resetAgent(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    agent.reset(args.what as ResetWhat[]);
    return { success: true };
  },
});
