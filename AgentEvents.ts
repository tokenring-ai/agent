import {z} from "zod";
import {QuestionSchema} from "./question.ts";

export const AgentCreatedSchema = z.object({
  type: z.literal("agent.created"),
  message: z.string(),
  timestamp: z.number(),
});

export const AgentStoppedSchema = z.object({
  type: z.literal("agent.stopped"),
  message: z.string(),
  timestamp: z.number(),
});

export const OutputArtifactSchema = z.object({
  type: z.literal("output.artifact"),
  name: z.string(),
  encoding: z.enum(["text","base64"]),
  mimeType: z.string(),
  body: z.string(),
  timestamp: z.number(),
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

export const AttachmentSchema = z.object({
  type: z.literal("attachment"),
  name: z.string(),
  encoding: z.enum(["text","base64","href"]),
  mimeType: z.string(),
  body: z.string(),
  timestamp: z.number(),
})

export const InputMessageSchema = z.object({
  from: z.string(),
  message: z.string(),
  attachments: z.array(AttachmentSchema).optional(),
})

export type InputMessage = z.input<typeof InputMessageSchema>;

/*
export const InputHandledSchema = z.object({
  type: z.literal("input.handled"),
  timestamp: z.number(),
  message: z.string(),
  requestId: z.string(),
  status: z.enum(["success", "error", "cancelled"]),
});

export const PauseSchema = z.object({
  type: z.literal("pause"),
  timestamp: z.number(),
  message: z.string()
});

export const ResumeSchema = z.object({
  type: z.literal("resume"),
  timestamp: z.number(),
  message: z.string()
});

export const AbortSchema = z.object({
  type: z.literal("abort"),
  timestamp: z.number(),
  message: z.string()
});

export const StatusSchema = z.object({
  type: z.literal("status"),
  timestamp: z.number(),
  message: z.string()
})*/

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
  autoSubmitAt: z.number().optional()
})

export const InteractionSchema = z.discriminatedUnion('type', [
  FollowupInteractionSchema,
  QuestionInteractionSchema,
]);

export type InputAttachment = z.input<typeof AttachmentSchema>;

export const InputReceivedSchema = z.object({
  type: z.literal("input.received"),
  timestamp: z.number(),
  input: InputMessageSchema,
  requestId: z.string(),
});

export type ParsedInputReceived = z.output<typeof InputReceivedSchema>;

export const AgentCancelledResponseSchema = z.object({
  type: z.literal("agent.response"),
  timestamp: z.number(),
  requestId: z.string(),
  status: z.literal("cancelled"),
  message: z.string(),
});

export type ParsedAgentCancelledResponse = z.output<typeof AgentCancelledResponseSchema>;

export const AgentErrorResponseSchema = z.object({
  type: z.literal("agent.response"),
  timestamp: z.number(),
  requestId: z.string(),
  status: z.literal("error"),
  message: z.string(),
});

export type ParsedAgentErrorResponse = z.output<typeof AgentErrorResponseSchema>;

export const AgentSuccessResponseSchema = z.object({
  type: z.literal("agent.response"),
  timestamp: z.number(),
  requestId: z.string(),
  status: z.literal("success"),
  message: z.string(),
  attachments: z.array(AttachmentSchema).optional(),
});

export type ParsedAgentSuccessResponse = z.output<typeof AgentSuccessResponseSchema>;

export const InputExecutionStateSchema = z.object({
  type: z.literal("input.execution"),
  timestamp: z.number(),
  requestId: z.string(),
  status: z.enum(['queued', "running", "finished"]),
  currentActivity: z.string().optional(),
  availableInteractions: z.array(InteractionSchema).optional(),
});

export const AgentResponseSchema = z.discriminatedUnion("status", [
  AgentCancelledResponseSchema,
  AgentErrorResponseSchema,
  AgentSuccessResponseSchema
]);

export type ParsedAgentResponse = z.output<typeof AgentResponseSchema>;


export const InputCancelSchema = z.object({
  type: z.literal("cancel"),
  timestamp: z.number(),
  requestId: z.string(),
})

export type InputReceived = z.input<typeof InputReceivedSchema>;

export const AgentStatusSchema = z.object({
  type: z.literal("agent.status"),
  status: z.enum(["starting", "running", "shutdown"]),
  timestamp: z.number(),
  inputExecutionQueue: z.array(z.string()),
  currentActivity: z.string()
});


export type ParsedAgentStatus = z.output<typeof AgentStatusSchema>;
export type InteractionRequest = z.input<typeof InteractionSchema>;
export type ParsedInteractionRequest = z.output<typeof InteractionSchema>

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
]);

export type AgentEventEnvelope = z.output<typeof AgentEventEnvelopeSchema>;
