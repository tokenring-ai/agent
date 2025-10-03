import type { ContextItem, TokenRingService } from "@tokenring-ai/agent/types";
import Agent from "./Agent.js";

export default class AgentContextService implements TokenRingService {
	name = "AgentContextService";
	description = "Dispatches sub-agents to handle tasks";

	async *getContextItems(agent: Agent): AsyncGenerator<ContextItem> {
		if (agent.tools.getActiveItemNames().has("@tokenring-ai/agent/runAgent")) {
			// Get the list of available agent types from the agent team
			const agentTypes = agent.team.getAgentConfigs();

			yield {
				position: "afterSystemMessage",
				role: "user",
				content:
					`/* The following agents can be run with the agent tool */` +
					Object.entries(agentTypes)
						.filter(([name, config]) => config.type === "background")
						.map(([name, config]) => `- ${name}: ${config.description}`)
						.join("\n"),
			};
		}
	}
}
