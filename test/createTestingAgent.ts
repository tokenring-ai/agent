import TokenRingApp from "@tokenring-ai/app";

// Create a mock agent
import Agent from "../Agent";
import {AgentManager} from "../index";
import {AgentConfig} from "../schema";

const config = {
  name: "Mock Agent",
  type: "interactive",
  description: "A mock agent for testing purposes",
  category: "test",
  visual: {
    color: "blue",
  },
  chat: {
    systemPrompt: "You are a helpful assistant."
  }
} satisfies AgentConfig;

export default function createTestingAgent(app: TokenRingApp) {
  let agentManager = app.getService(AgentManager);
  if (!agentManager) {
    agentManager = new AgentManager(app);
    app.addServices(agentManager);
  }

  const agent = new Agent(app, {headless: true, config});
  agentManager.agents.set(agent.id, agent);
  return agent;
};