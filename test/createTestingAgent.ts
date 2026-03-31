import TokenRingApp from "@tokenring-ai/app";

// Create a mock agent
import Agent from "../Agent";
import {AgentManager} from "../index";
import {AgentConfigSchema} from "../schema";

const config = AgentConfigSchema.parse({
  agentType: "mock-agent",
  displayName: "Mock Agent",
  description: "A mock agent for testing purposes",
  category: "test",
  createMessage: "",
  headless: true,
  debug: false,
  initialCommands: [],
  callable: true,
  idleTimeout: 0,
  maxRunTime: 0,
  minimumRunning: 0,
  subAgent: {
    allowedSubAgents: [],
  },
});

export default function createTestingAgent(app: TokenRingApp) {
  let agentManager = app.getService(AgentManager);
  if (!agentManager) {
    agentManager = new AgentManager(app);
    app.addServices(agentManager);
  }

  const agent = new Agent(app, {}, config, new AbortController().signal);
  agentManager.agents.set(agent.id, { agent, shutdownController: new AbortController() });
  return agent;
};
