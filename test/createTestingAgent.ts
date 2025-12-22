import TokenRingApp from "@tokenring-ai/app";

// Create a mock agent
import Agent from "../Agent";
import {AgentConfig} from "../types";

const config = {
  name: "Mock Agent",
  type: "interactive",
  description: "A mock agent for testing purposes",
  category: "test",
  visual: {
    color: "blue",
  }
} satisfies AgentConfig;

export default function createTestingAgent(app: TokenRingApp) {
  return new Agent(app, {headless: true, config});
};