import type {
  HumanInterfaceRequest,
  HumanInterfaceResponse,
} from "./HumanInterfaceRequest.js";

export type ResetWhat = "context" | "chat" | "history" | "settings" | "memory";

export interface AgentEvents {
  "output.chat": { content: string };
  "output.reasoning": { content: string };
  "output.system": { message: string; level: "info" | "warning" | "error" };
  "input.received": { message: string, requestId: string };
  "input.handled": { message: string, requestId: string, status: "success" | "error" | "cancelled" };
  "human.request": { request: HumanInterfaceRequest; id: string };
  "human.response": { requestId: string; response: HumanInterfaceResponse };
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
export type InputReceivedEnvelope = AgentEventEnvelopesByType<"input.received">;
export type InputHandledEnvelope = AgentEventEnvelopesByType<"input.handled">;
export type HumanRequestEnvelope = AgentEventEnvelopesByType<"human.request">;
export type HumanResponseEnvelope = AgentEventEnvelopesByType<"human.response">;
export type ResetEnvelope = AgentEventEnvelopesByType<"reset">;

export type AgentEventEnvelope =
  | ChatOutputEnvelope
  | ReasoningOutputEnvelope
  | SystemEventEnvelope
  | InputReceivedEnvelope
  | InputHandledEnvelope
  | HumanRequestEnvelope
  | HumanResponseEnvelope
  | ResetEnvelope;
