import TokenRingApp from "@tokenring-ai/app";
import type {ChatAgentConfigSchema} from "@tokenring-ai/chat/schema";
import {z} from "zod";

// Create a mock agent
import Agent from "../Agent";
import {AgentManager} from "../index";
import {AgentConfig, AgentConfigSchema, type ParsedAgentConfig} from "../schema";

const config = {
  ...AgentConfigSchema.parse({
    name: "Mock Agent",
    description: "A mock agent for testing purposes",
    category: "test",
    createMessage: "",
  }),
  chat: {
    systemPrompt: "You are a helpful assistant."
  },
};

export default function createTestingAgent(app: TokenRingApp) {
  let agentManager = app.getService(AgentManager);
  if (!agentManager) {
    agentManager = new AgentManager(app);
    app.addServices(agentManager);
  }

  const agent = new Agent(app, config);
  agentManager.agents.set(agent.id, agent);
  return agent;
};