import { z } from "zod";
import {
  HumanInterfaceRequestSchema,
} from "./HumanInterfaceRequest.js";

export const ResetWhatSchema = z.enum(["context", "chat", "history", "settings", "memory", "costs"]);
export type ResetWhat = z.infer<typeof ResetWhatSchema>;

export const AgentCreatedSchema = z.object({
  type: z.literal("agent.created"),
  timestamp: z.number()
});

export const AgentStoppedSchema = z.object({
  type: z.literal("agent.stopped"),
  timestamp: z.number()
});

export const OutputChatSchema = z.object({
  type: z.literal("output.chat"),
  timestamp: z.number(),
  message: z.string(),
});

export const OutputReasoningSchema = z.object({
  type: z.literal("output.reasoning"),
  timestamp: z.number(),
  message: z.string(),
});

export const OutputInfoSchema = z.object({
  type: z.literal("output.info"),
  timestamp: z.number(),
  message: z.string(),
});
export const OutputWarningSchema = z.object({
  type: z.literal("output.warning"),
  timestamp: z.number(),
  message: z.string(),
});
export const OutputErrorSchema = z.object({
  type: z.literal("output.error"),
  timestamp: z.number(),
  message: z.string(),
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

export const AbortSchema = z.object({
  type: z.literal("abort"),
  timestamp: z.number(),
  reason: z.string().optional(),
});

export const AgentEventEnvelopeSchema = z.discriminatedUnion("type", [
  AgentCreatedSchema,
  AgentStoppedSchema,
  OutputChatSchema,
  OutputReasoningSchema,
  OutputInfoSchema,
  OutputWarningSchema,
  OutputErrorSchema,
  InputReceivedSchema,
  InputHandledSchema,
  HumanRequestSchema,
  HumanResponseSchema,
  ResetSchema,
  AbortSchema,
]);

export type AgentEventEnvelope = z.infer<typeof AgentEventEnvelopeSchema>;