import type {ResetWhat} from "../AgentEvents.js";
import type {SerializableStateSlice} from "../StateManager.js";

export class HooksState implements SerializableStateSlice {
	name = "HooksState";
	enabledHooks: string[] = [];

	constructor({ enabledHooks = [] }: { enabledHooks?: string[] } = {}) {
		this.enabledHooks = [...enabledHooks];
	}

	reset(what: ResetWhat[]): void {
		if (what.includes("settings")) {
			this.enabledHooks = [];
		}
	}

	serialize(): object {
		return {
			enabledHooks: this.enabledHooks,
		};
	}

	deserialize(data: any): void {
		this.enabledHooks = data.enabledHooks ? [...data.enabledHooks] : [];
	}

	show(): string[] {
		return [
			`Enabled Hooks: ${this.enabledHooks.length > 0 ? this.enabledHooks.join(", ") : "None"}`
		];
	}
}
