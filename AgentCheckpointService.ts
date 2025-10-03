import type { TokenRingService } from "@tokenring-ai/agent/types";
import Agent from "./Agent.js";
import type { AgentCheckpointProvider } from "./AgentCheckpointProvider.js";

export default class AgentCheckpointService implements TokenRingService {
	name = "AgentCheckpointService";
	description = "Persists agent state to a storage provider";

	provider: AgentCheckpointProvider;
	constructor(provider: AgentCheckpointProvider) {
		this.provider = provider;
	}

	async saveAgentCheckpoint(name: string, agent: Agent): Promise<string> {
		return await this.provider.storeCheckpoint({
			name,
			...agent.generateCheckpoint(),
		});
	}

	async restoreAgentCheckpoint(id: string, agent: Agent): Promise<void> {
		const checkpoint = await this.provider.retrieveCheckpoint(id);
		if (!checkpoint) {
			throw new Error(`Checkpoint ${id} not found`);
		}
		agent.restoreCheckpoint(checkpoint);
	}

	async listCheckpoints() {
		return await this.provider.listCheckpoints();
	}
}
