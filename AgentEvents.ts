import { z } from "zod";
import { QuestionSchema } from "./question.ts";

export const BaseTextEventSchema = z.object({
  message: z.string(),
  details: z.array(z.string()).exactOptional(),
  timestamp: z.number(),
});

export const AgentCreatedSchema = BaseTextEventSchema.extend({
  type: z.literal("agent.created"),
});

export const AgentStoppedSchema = BaseTextEventSchema.extend({
  type: z.literal("agent.stopped"),
});

export const OutputChatSchema = BaseTextEventSchema.extend({
  type: z.literal("output.chat"),
});

export const OutputReasoningSchema = BaseTextEventSchema.extend({
  type: z.literal("output.reasoning"),
});

export const OutputInfoSchema = BaseTextEventSchema.extend({
  type: z.literal("output.info"),
});
export const OutputWarningSchema = BaseTextEventSchema.extend({
  type: z.literal("output.warning"),
});
export const OutputErrorSchema = BaseTextEventSchema.extend({
  type: z.literal("output.error"),
});

export const BaseAttachmentSchema = z.object({
  name: z.string(),
  description: z.string().exactOptional(),
  encoding: z.enum(["text", "base64", "href"]),
  mimeType: z.enum(["application/json", "text/plain", "text/markdown", "text/html", "text/x-diff", "image/png", "image/jpeg", "message/rfc822"]),
  body: z.string(),
});

export const allowedMimeTypes = BaseAttachmentSchema.shape.mimeType.enum;

export type BaseAttachment = z.output<typeof BaseAttachmentSchema>;

export const AttachmentSchema = BaseAttachmentSchema.extend({
  type: z.literal("attachment"),
  timestamp: z.number(),
});

export type AttachmentMessage = z.output<typeof AttachmentSchema>;

export const OutputArtifactSchema = BaseAttachmentSchema.extend({
  type: z.literal("output.artifact"),
  timestamp: z.number(),
});

export type Artifact = z.input<typeof OutputArtifactSchema>;

export const InputMessageSchema = z.object({
  from: z.string(),
  message: z.string(),
  attachments: z.array(BaseAttachmentSchema).exactOptional(),
  timestamp: z.never().exactOptional(),
});

export type InputMessage = z.input<typeof InputMessageSchema>;

export const ToolCallAttachmentSchema = BaseAttachmentSchema.extend({
  sendToLLM: z.boolean().default(false),
});

export type ToolCallAttachment = z.input<typeof ToolCallAttachmentSchema>;
export type ParsedToolCallAttachment = z.output<typeof ToolCallAttachmentSchema>;

export const ToolCallResultSchema = z.object({
  type: z.literal("toolCall"),
  timestamp: z.number(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  summary: z.string(), //Markdown string, i.e. Bash(ls -la foo)
  result: z.string(),
  actions: z.array(z.string()).exactOptional(), // Markdown list of items
  attachments: z.array(ToolCallAttachmentSchema).exactOptional(),
});

export type ToolCallResult = z.input<typeof ToolCallResultSchema>;
export type ParsedToolCallResult = z.output<typeof ToolCallResultSchema>;

/* A question request is a request that immediately requires an answer from the user for a single form field
 * This is used for functionality such as when the user needs to immediately select a model or provider */
export const InteractionResponseSchema = z.object({
  type: z.literal("input.interaction"),
  timestamp: z.number(),
  requestId: z.string(),
  interactionId: z.string(),
  result: z.any(),
});

export const FollowupInteractionSchema = z.object({
  type: z.literal("followup"),
  interactionId: z.string(),
  timestamp: z.number(),
  message: z.string(),
});

export const QuestionInteractionSchema = z.object({
  type: z.literal("question"),
  interactionId: z.string(),
  timestamp: z.number(),
  message: z.string(),
  question: QuestionSchema,
  optional: z.boolean().default(false),
  autoSubmitAt: z.number().exactOptional(),
});

export const InteractionSchema = z.discriminatedUnion("type", [FollowupInteractionSchema, QuestionInteractionSchema]);

export type Interaction = z.input<typeof InteractionSchema>;
export type ParsedInteraction = z.output<typeof InteractionSchema>;

export type InputAttachment = z.input<typeof AttachmentSchema>;

export const InputReceivedSchema = z.object({
  type: z.literal("input.received"),
  timestamp: z.number(),
  input: InputMessageSchema,
  requestId: z.string(),
});

export type ParsedInputReceived = z.output<typeof InputReceivedSchema>;

export const AgentCancelledResponseSchema = BaseTextEventSchema.extend({
  type: z.literal("agent.response"),
  requestId: z.string(),
  status: z.literal("cancelled"),
});

export type ParsedAgentCancelledResponse = z.output<typeof AgentCancelledResponseSchema>;

export const AgentErrorResponseSchema = BaseTextEventSchema.extend({
  type: z.literal("agent.response"),
  requestId: z.string(),
  status: z.literal("error"),
});

export type ParsedAgentErrorResponse = z.output<typeof AgentErrorResponseSchema>;

export const AgentSuccessResponseSchema = BaseTextEventSchema.extend({
  type: z.literal("agent.response"),
  requestId: z.string(),
  status: z.literal("success"),
  attachments: z.array(AttachmentSchema).exactOptional(),
});

export type ParsedAgentSuccessResponse = z.output<typeof AgentSuccessResponseSchema>;

export const InputExecutionStateSchema = z.object({
  type: z.literal("input.execution"),
  timestamp: z.number(),
  requestId: z.string(),
  status: z.enum(["queued", "running", "finished"]),
  currentActivity: z.string().exactOptional(),
  availableInteractions: z.array(InteractionSchema).exactOptional(),
});

export const AgentResponseSchema = z.discriminatedUnion("status", [AgentCancelledResponseSchema, AgentErrorResponseSchema, AgentSuccessResponseSchema]);

export type ParsedAgentResponse = z.output<typeof AgentResponseSchema>;

export const InputCancelSchema = z.object({
  type: z.literal("cancel"),
  timestamp: z.number(),
  requestId: z.string(),
});

export type InputReceived = z.input<typeof InputReceivedSchema>;

export const AgentStatusSchema = z.object({
  type: z.literal("agent.status"),
  status: z.enum(["starting", "running", "shutdown"]),
  timestamp: z.number(),
  inputExecutionQueue: z.array(z.string()),
  currentActivity: z.string(),
});

export type ParsedAgentStatus = z.output<typeof AgentStatusSchema>;
export type InteractionRequest = z.input<typeof InteractionSchema>;
export type ParsedInteractionRequest = z.output<typeof InteractionSchema>;

export type InteractionResponse = z.input<typeof InteractionResponseSchema>;
export type ParsedInteractionResponse = z.output<typeof InteractionResponseSchema>;

export type QuestionResponse = z.output<typeof QuestionInteractionSchema>;

export const AgentEventEnvelopeSchema = z.discriminatedUnion("type", [
  AgentCreatedSchema,
  AgentStoppedSchema,
  AgentStatusSchema,
  AgentResponseSchema,
  OutputArtifactSchema,
  OutputChatSchema,
  OutputReasoningSchema,
  OutputInfoSchema,
  OutputWarningSchema,
  OutputErrorSchema,
  InputReceivedSchema,
  InputCancelSchema,
  InputExecutionStateSchema,
  InteractionResponseSchema,
  ToolCallResultSchema,
]);

export type AgentEventEnvelope = z.output<typeof AgentEventEnvelopeSchema>;
