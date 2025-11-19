import Agent from "@tokenring-ai/agent/Agent";
import type {AgentConfig, AgentStateSlice, TokenRingService,} from "@tokenring-ai/agent/types";
import formatLogMessages from "@tokenring-ai/utility/formatLogMessage";
import TypedRegistry from "@tokenring-ai/utility/TypedRegistry";
import {EventEmitter} from "eventemitter3";
import {z} from "zod";
import StateManager, {type StateStorageInterface} from "./StateManager.js";

export type AgentTeamConfig = Record<string, any>;

export default class AgentTeam implements TokenRingService, StateStorageInterface<AgentStateSlice> {
  name = "AgentTeam";
  description = "A team of AI agents that work together";

  services = new TypedRegistry<TokenRingService>();

  requireService = this.services.requireItemByType;
  getService = this.services.getItemByType;
  getServices = this.services.getItems;
  addServices = this.services.register;
  readonly events = new EventEmitter();
  //private agentInstanceRegistry = new KeyedRegistry<Agent>();
  private agents: Map<string, Agent> = new Map();
  private config: AgentTeamConfig;
  private stateManager = new StateManager();
  initializeState = this.stateManager.initializeState.bind(this.stateManager);
  mutateState = this.stateManager.mutateState.bind(this.stateManager);
  getState = this.stateManager.getState.bind(this.stateManager);

  constructor(config: AgentTeamConfig) {
    this.config = config;
  }

  waitForService = <R extends TokenRingService>(
    serviceType: abstract new (...args: any[]) => R,
    callback: (service: R) => Promise<void> | void
  ): void => {
    this.services.waitForItemByType(serviceType).then(callback).catch((err) => {
      console.error(err);
    });
  }

  getConfigSlice<T extends z.ZodTypeAny>(key: string, schema: T): z.infer<T> {
    try {
      return schema.parse(this.config[key]);
    } catch (error) {
      throw new Error(
        `Invalid config value for key "${key}": ${(error as Error).message}`,
      );
    }
  }

  /**
   * Log a system message
   */
  serviceOutput(...msgs: any[]): void {
    this.events.emit("serviceOutput", formatLogMessages(msgs));
  }

  serviceError(...msgs: any[]): void {
    this.events.emit("serviceError", formatLogMessages(msgs));
  }

  async createAgent(agentConfig: AgentConfig): Promise<Agent> {
    const agent = new Agent(this, agentConfig);

    this.agents.set(agent.id, agent);

    // noinspection ES6MissingAwait
    agent.initialize(); // Initialize the agent in the background
    return agent;
  }

  async deleteAgent(agent: Agent): Promise<void> {
    agent.requestAbort("AgentManager initiated shutdown");

    this.agents.delete(agent.id);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }
}
