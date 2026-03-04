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

export const InputAttachmentSchema = z.object({
  name: z.string(),
  encoding: z.enum(["text","base64","href"]),
  mimeType: z.string(),
  body: z.string(),
  timestamp: z.number(),
})

export type InputAttachment = z.input<typeof InputAttachmentSchema>;

export const InputReceivedSchema = z.object({
  type: z.literal("input.received"),
  timestamp: z.number(),
  message: z.string(),
  attachments: z.array(InputAttachmentSchema).optional(),
  requestId: z.string(),
});

export type InputReceived = z.input<typeof InputReceivedSchema>;
export type BareInputReceivedMessage = Omit<InputReceived, "timestamp" | "type" | "requestId">;

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
})

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

export const AgentExecutionStateSchema = z.object({
  type: z.literal("agent.execution"),
  running: z.boolean(),
  paused: z.boolean(),
  timestamp: z.number(),
  busyWith: z.string().nullable(),
  waitingOn: z.array(QuestionRequestSchema),
  inputQueue: z.array(InputReceivedSchema),
  currentlyExecuting: z.string().nullable()
});

export type ParsedAgentExecutionState = z.output<typeof AgentExecutionStateSchema>;
export type QuestionRequest = z.input<typeof QuestionRequestSchema>;
export type ParsedQuestionRequest = z.output<typeof QuestionRequestSchema>
export type QuestionResponse = z.output<typeof QuestionResponseSchema>;

export const AgentEventEnvelopeSchema = z.discriminatedUnion("type", [
  AgentCreatedSchema,
  AgentStoppedSchema,
  AgentExecutionStateSchema,
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
  PauseSchema,
  ResumeSchema,
  AbortSchema,
  StatusSchema,
]);

export type AgentEventEnvelope = z.output<typeof AgentEventEnvelopeSchema>;
