import type {
  HumanInterfaceRequest,
  HumanInterfaceResponse,
} from "./HumanInterfaceRequest.js";

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
  "human.response": { responseTo: number; response: HumanInterfaceResponse };
  reset: { what: ResetWhat[] };
}

export type AgentEventEnvelopesByType<T extends keyof AgentEvents> = {
  type: T;
  data: {
    [K in keyof AgentEvents[T]]: AgentEvents[T][K];
  },
  timestamp: number
};
export type ChatOutputEnvelope = AgentEventEnvelopesByType<"output.chat">;
export type ReasoningOutputEnvelope = AgentEventEnvelopesByType<"output.reasoning">;
export type SystemEventEnvelope = AgentEventEnvelopesByType<"output.system">;
export type StateBusyEnvelope = AgentEventEnvelopesByType<"state.busy">;
export type StateNotBusyEnvelope = AgentEventEnvelopesByType<"state.notBusy">;
export type StateIdleEnvelope = AgentEventEnvelopesByType<"state.idle">;
export type StateAbortedEnvelope = AgentEventEnvelopesByType<"state.aborted">;
export type StateExitEnvelope = AgentEventEnvelopesByType<"state.exit">;
export type InputReceivedEnvelope = AgentEventEnvelopesByType<"input.received">;
export type HumanRequestEnvelope = AgentEventEnvelopesByType<"human.request">;
export type HumanResponseEnvelope = AgentEventEnvelopesByType<"human.response">;
export type ResetEnvelope = AgentEventEnvelopesByType<"reset">;

export type AgentEventEnvelope =
  | ChatOutputEnvelope
  | ReasoningOutputEnvelope
  | SystemEventEnvelope
  | StateBusyEnvelope
  | StateNotBusyEnvelope
  | StateIdleEnvelope
  | StateAbortedEnvelope
  | StateExitEnvelope
  | InputReceivedEnvelope
  | HumanRequestEnvelope
  | HumanResponseEnvelope
  | ResetEnvelope;
