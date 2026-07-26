import { z } from "zod";
import { QuestionSchema } from "./question.ts";

export const BaseTextEventSchema = z.object({
  message: z.string(),
  timestamp: z.number(),
});

export const AgentCreatedSchema = BaseTextEventSchema.extend({
  type: z.literal("agent.created"),
  details: z.array(z.string()).exactOptional(),
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

export const audioMimeTypes = ["audio/wav", "audio/mpeg", "audio/webm"] as const;

export const videoMimeTypes = ["video/mp4", "video/webm"] as const;

export const imageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;

export const textMimeTypes = ["text/plain", "text/markdown", "text/html", "text/x-diff", "application/json", "message/rfc822"] as const;

export type AudioMimeTypes = (typeof audioMimeTypes)[number];
export type VideoMimeTypes = (typeof videoMimeTypes)[number];
export type ImageMimeTypes = (typeof imageMimeTypes)[number];
export type TextMimeTypes = (typeof textMimeTypes)[number];

export type SupportedMimeTypes = AudioMimeTypes | VideoMimeTypes | ImageMimeTypes | TextMimeTypes;

export const mimeTypeClassifications = new Map<SupportedMimeTypes, "audio" | "video" | "image" | "text">([
  ...audioMimeTypes.map(t => [t, "audio"] as const),
  ...videoMimeTypes.map(t => [t, "video"] as const),
  ...imageMimeTypes.map(t => [t, "image"] as const),
  ...textMimeTypes.map(t => [t, "text"] as const),
]);

export const BaseAttachmentSchema = z.object({
  name: z.string(),
  description: z.string().exactOptional(),
  encoding: z.enum(["text", "base64", "href"]),
  body: z.string(),
});

export type BaseAttachment = z.infer<typeof BaseAttachmentSchema>;

export const ChatAttachmentSchema = BaseAttachmentSchema.extend({
  mimeType: z.enum([...audioMimeTypes, ...videoMimeTypes, ...imageMimeTypes, ...textMimeTypes]),
});

export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

export const InputMessageSchema = z.object({
  from: z.string(),
  message: z.string(),
  attachments: z.array(ChatAttachmentSchema).exactOptional(),
  timestamp: z.never().exactOptional(),
});

export type InputMessage = z.input<typeof InputMessageSchema>;

export const ToolCallAttachmentSchema = ChatAttachmentSchema.extend({
  mimeType: z.enum([...textMimeTypes, ...imageMimeTypes]),
  sendToLLM: z.boolean().default(false),
});

export type ToolCallAttachment = z.input<typeof ToolCallAttachmentSchema>;
export type ParsedToolCallAttachment = z.output<typeof ToolCallAttachmentSchema>;

export const ToolCallResultSchema = z.object({
  type: z.literal("toolCall"),
  timestamp: z.number(),
  name: z.string().describe("The exact name of the tool that was called"),
  args: z.record(z.string(), z.json()).describe("The arguments passed to the tool"),
  message: z
    .string()
    .describe('A single line markdown string, with a bolded intent at the beginning, that summarizes what was done i.e. "**File** Read 3 files"'),
  actions: z
    .array(z.string())
    .exactOptional()
    .describe(
      "An itemized list of actions taken, which is displayed as a list under the item in verbose mode." +
        'Should not included the bolded intent, i.e. ["Read a.txt", "Read b.txt", "Read c.txt"]',
    ),
  failed: z.boolean().default(false).describe("Whether the tool call soft-failed, i.e. was not called properly or returned not-useful results"),
  result: z.string().describe("The result of the tool call, sent to the LLM"),
  summary: z.never().exactOptional(),
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
  result: z.unknown(),
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
  attachments: z.array(ChatAttachmentSchema).exactOptional(),
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
