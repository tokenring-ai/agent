import type {HumanInterfaceRequest} from "./HumanInterfaceRequest.js";

export type ResetWhat = "chat" | "history" | "settings" | "memory";

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
  | { type: "output.chat"; data: { content: string }; timestamp: number }
  | { type: "output.reasoning"; data: { content: string }; timestamp: number }
  | {
  type: "output.system";
  data: { message: string; level: "info" | "warning" | "error" };
  timestamp: number;
}
  | { type: "state.busy"; data: { message: string }; timestamp: number }
  | { type: "state.notBusy"; data: {}; timestamp: number }
  | { type: "state.idle"; data: {}; timestamp: number }
  | { type: "state.aborted"; data: { reason: string }; timestamp: number }
  | { type: "state.exit"; data: {}; timestamp: number }
  | { type: "input.received"; data: { message: string }; timestamp: number }
  | {
  type: "human.request";
  data: { request: HumanInterfaceRequest; sequence: number };
  timestamp: number;
}
  | { type: "human.response"; data: { responseTo: number; response: any }; timestamp: number }
  | { type: "reset"; data: { what: ResetWhat[] }; timestamp: number };
