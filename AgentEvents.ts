import {z} from "zod";
import {QuestionSchema} from "./question.ts";

export const ResetWhatSchema = z.enum(["context", "chat", "history", "settings", "memory", "costs"]);
export type ResetWhat = z.infer<typeof ResetWhatSchema>;

export const AgentCreatedSchema = z.object({
  type: z.literal("agent.created"),
  message: z.string(),
  timestamp: z.number()
});

export const AgentStoppedSchema = z.object({
  type: z.literal("agent.stopped"),
  message: z.string(),
  timestamp: z.number()
});

export const OutputArtifactSchema = z.object({
  type: z.literal("output.artifact"),
  name: z.string(),
  encoding: z.enum(["text","base64"]),
  mimeType: z.string(),
  body: z.string(),
  timestamp: z.number()
})

export type Artifact = z.input<typeof OutputArtifactSchema>;

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

export type InputReceived = z.input<typeof InputReceivedSchema>;

export const InputHandledSchema = z.object({
  type: z.literal("input.handled"),
  timestamp: z.number(),
  message: z.string(),
  requestId: z.string(),
  status: z.enum(["success", "error", "cancelled"]),
});

export const ResetSchema = z.object({
  type: z.literal("reset"),
  timestamp: z.number(),
  what: z.array(ResetWhatSchema),
});

export const AbortSchema = z.object({
  type: z.literal("abort"),
  timestamp: z.number(),
  message: z.string()
});

/* A question request is a request that immediately requires an answer from the user for a single form field
* This is used for functionality such as when the user needs to immediately select a model or provider */
export const QuestionResponseSchema = z.object({
  type: z.literal("question.response"),
  timestamp: z.number(),
  requestId: z.string(),
  result: z.any(),
});

export const QuestionRequestSchema = z.object({
  type: z.literal("question.request"),
  immediate: z.boolean().default(true),
  timestamp: z.number(),
  requestId: z.string(),
  message: z.string(),
  question: QuestionSchema,
  autoSubmitAfter: z.number().default(0)
});

export type QuestionRequest = z.input<typeof QuestionRequestSchema>;
export type ParsedQuestionRequest = z.output<typeof QuestionRequestSchema>
export type QuestionResponse = z.output<typeof QuestionResponseSchema>;

export const AgentEventEnvelopeSchema = z.discriminatedUnion("type", [
  AgentCreatedSchema,
  AgentStoppedSchema,
  OutputArtifactSchema,
  OutputChatSchema,
  OutputReasoningSchema,
  OutputInfoSchema,
  OutputWarningSchema,
  OutputErrorSchema,
  InputReceivedSchema,
  InputHandledSchema,
  QuestionRequestSchema,
  QuestionResponseSchema,
  ResetSchema,
  AbortSchema,
]);

export type AgentEventEnvelope = z.output<typeof AgentEventEnvelopeSchema>;