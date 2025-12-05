import TokenRingApp from "@tokenring-ai/app";
import {createJsonRPCEndpoint} from "@tokenring-ai/web-host/jsonrpc/createJsonRPCEndpoint";
import {ResetWhat} from "../AgentEvents.ts";
import AgentManager from "../services/AgentManager.js";
import { AgentEventState } from "../state/agentEventState.js";
import { AgentRpcSchemas } from "./types.ts";

export default createJsonRPCEndpoint(AgentRpcSchemas, {
  getAgent(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    return {
      id: agent.id,
      name: agent.name,
      type: agent.config.type,
      description: agent.description,
      debugEnabled: agent.debugEnabled,
    };
  },

  getAgentEvents(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const state = agent.getState(AgentEventState);
    return {
      events: state.events.slice(args.fromPosition),
      position: state.events.length,
      idle: state.idle,
      busyWith: state.busyWith,
      waitingOn: state.waitingOn,
    };
  },

  listAgents(_args, app) {
    return app.requireService(AgentManager).getAgents().map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      type: agent.config.type,
      description: agent.description,
    }));
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
      name: agent.name,
      type: agent.config.type,
      description: agent.description,
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