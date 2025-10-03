import type { HumanInterfaceRequest } from "./HumanInterfaceRequest.js";

export type ResetWhat = "chat" | "history" | "settings";

export interface AgentEvents {
	"output.chat": { content: string };
	"output.reasoning": { content: string };
	"output.system": { message: string; level: "info" | "warning" | "error" };
	"state.busy": { message: string };
	"state.notBusy": {};
	"state.idle": {};
	"state.aborted": { reason: string };
	"state.exit": {};
	"input.received": { message: string };
	"human.request": { request: HumanInterfaceRequest; sequence: number };
	"human.response": { responseTo: number; response: any };
	reset: { what: ResetWhat[] };
}

export type AgentEventEnvelope =
	| { type: "output.chat"; data: { content: string } }
	| { type: "output.reasoning"; data: { content: string } }
	| {
			type: "output.system";
			data: { message: string; level: "info" | "warning" | "error" };
	  }
	| { type: "state.busy"; data: { message: string } }
	| { type: "state.notBusy"; data: {} }
	| { type: "state.idle"; data: {} }
	| { type: "state.aborted"; data: { reason: string } }
	| { type: "state.exit"; data: {} }
	| { type: "input.received"; data: { message: string } }
	| {
			type: "human.request";
			data: { request: HumanInterfaceRequest; sequence: number };
	  }
	| { type: "human.response"; data: { responseTo: number; response: any } }
	| { type: "reset"; data: { what: ResetWhat[] } };
