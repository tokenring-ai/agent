import type {ResetWhat} from "../AgentEvents.js";
import type {StateSlice} from "../StateManager.js";

export class CommandHistoryState implements StateSlice {
	name = "CommandHistoryState";
	commands: string[] = [];

	constructor({ commands }: { commands?: string[] }) {
		this.commands = commands ? [...commands] : [];
	}

	reset(what: ResetWhat[]): void {
		// Doesn't reset
	}

	serialize(): object {
		return {
			commands: this.commands,
		};
	}

	deserialize(data: any): void {
		this.commands = data.commands ? [...data.commands] : [];
	}
}
