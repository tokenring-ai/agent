import Agent from "./Agent.js";

export interface AgentCheckpointData {
	agentId: string;
	createdAt: number;
	state: {
		//contextStorage: object;
		agentState: Record<string, object>;
		toolsEnabled: string[];
		hooksEnabled: string[];
	};
}

export interface NamedAgentCheckpoint extends AgentCheckpointData {
	name: string;
}

export interface StoredAgentCheckpoint extends NamedAgentCheckpoint {
	id: string;
}

export type AgentCheckpointListItem = Omit<StoredAgentCheckpoint, "state">;

export interface AgentCheckpointProvider {
	storeCheckpoint(data: NamedAgentCheckpoint): Promise<string>;
	retrieveCheckpoint(id: string): Promise<StoredAgentCheckpoint | null>;
	listCheckpoints(): Promise<AgentCheckpointListItem[]>;
}
