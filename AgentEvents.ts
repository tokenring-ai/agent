import { z } from "zod";
import {
  HumanInterfaceRequestSchema,
} from "./HumanInterfaceRequest.js";

export const ResetWhatSchema = z.enum(["context", "chat", "history", "settings", "memory"]);
export type ResetWhat = z.infer<typeof ResetWhatSchema>;

export const OutputChatSchema = z.object({
  type: z.literal("output.chat"),
  timestamp: z.number(),
  content: z.string(),
});

export const OutputReasoningSchema = z.object({
  type: z.literal("output.reasoning"),
  timestamp: z.number(),
  content: z.string(),
});

export const OutputSystemSchema = z.object({
  type: z.literal("output.system"),
  timestamp: z.number(),
  message: z.string(),
  level: z.enum(["info", "warning", "error"]),
});

export const InputReceivedSchema = z.object({
  type: z.literal("input.received"),
  timestamp: z.number(),
  message: z.string(),
  requestId: z.string(),
});

export const InputHandledSchema = z.object({
  type: z.literal("input.handled"),
  timestamp: z.number(),
  message: z.string(),
  requestId: z.string(),
  status: z.enum(["success", "error", "cancelled"]),
});

export const HumanRequestSchema = z.object({
  type: z.literal("human.request"),
  timestamp: z.number(),
  request: HumanInterfaceRequestSchema,
  id: z.string(),
});

export const HumanResponseSchema = z.object({
  type: z.literal("human.response"),
  timestamp: z.number(),
  requestId: z.string(),
  response: z.any(),
});

export const ResetSchema = z.object({
  type: z.literal("reset"),
  timestamp: z.number(),
  what: z.array(ResetWhatSchema),
});

export const AgentEventEnvelopeSchema = z.discriminatedUnion("type", [
  OutputChatSchema,
  OutputReasoningSchema,
  OutputSystemSchema,
  InputReceivedSchema,
  InputHandledSchema,
  HumanRequestSchema,
  HumanResponseSchema,
  ResetSchema,
]);

export type AgentEventEnvelope = z.infer<typeof AgentEventEnvelopeSchema>;