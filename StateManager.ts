import type { ResetWhat } from "./AgentEvents.js";

export interface StateSlice {
	name: string;
	reset: (what: ResetWhat[]) => void;
	serialize: () => object;
	deserialize: (data: object) => void;
	persistToSubAgents?: boolean;
}

export interface StateStorageInterface {
	getState<T extends StateSlice>(ClassType: new (...args: any[]) => T): T;
	mutateState<R, T extends StateSlice>(
		ClassType: new (...args: any[]) => T,
		callback: (state: T) => R,
	): R;
	initializeState<S, T extends StateSlice>(
		ClassType: new (props: S) => T,
		props: S,
	): void;
}

export default class StateManager implements StateStorageInterface {
	state = new Map<string, StateSlice>();

	initializeState<S, T extends StateSlice>(
		ClassType: new (props: S) => T,
		props: S,
	): void {
		this.state.set(ClassType.name, new ClassType(props));
	}

	mutateState<R, T extends StateSlice>(
		ClassType: new (...args: any[]) => T,
		callback: (state: T) => R,
	): R {
		const state = this.state.get(ClassType.name) as T;
		if (!state) {
			throw new Error(`State slice ${ClassType.name} not found`);
		}
		return callback(state);
	}

	getState<T extends StateSlice>(ClassType: new (...args: any[]) => T): T {
		const stateSlice = this.state.get(ClassType.name);
		if (!stateSlice) {
			throw new Error(`State slice ${ClassType.name} not found`);
		}
		return stateSlice as T;
	}

	reset(what: ResetWhat[]): void {
		for (const slice of this.state.values()) {
			slice.reset(what);
		}
	}

	serialize(): Record<string, object> {
		return Object.fromEntries(
			Array.from(this.state.entries()).map(([key, slice]) => [
				key,
				slice.serialize(),
			]),
		);
	}

	deserialize(data: Record<string, object>, onMissing?: (key: string) => void): void {
		for (const key in data) {
			const slice = this.state.get(key);
			if (slice) {
				slice.deserialize(data[key]);
			} else {
				onMissing?.(key);
			}
		}
	}

	entries(): IterableIterator<[string, StateSlice]> {
		return this.state.entries();
	}
}
