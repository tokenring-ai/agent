import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { AgentNotFoundSchema, SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { AgentEventEnvelopeSchema, InputMessageSchema, InteractionResponseSchema } from "../AgentEvents.ts";
import { AgentConfigSchema } from "../schema.ts";

export const AgentListEntrySchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  agentType: z.string(),
  displayName: z.string(),
  description: z.string(),
  idle: z.boolean(),
  currentActivity: z.string(),
});

/** Mirrors {@link import("../types.ts").AgentCommandArgumentSchema} for RPC transport. */
export const AgentCommandArgumentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    description: z.string(),
    defaultValue: z.string().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    required: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("number"),
    description: z.string(),
    defaultValue: z.number().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    required: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("flag"),
    description: z.string(),
  }),
  z.object({
    type: z.literal("date"),
    description: z.string(),
    defaultValue: z.number().optional(),
    required: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("enum"),
    description: z.string(),
    values: z.array(z.string()),
    defaultValue: z.string().optional(),
    required: z.boolean().optional(),
  }),
]);

export const AgentCommandPositionalSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
});

export const AgentCommandRemainderSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
});

/** Mirrors {@link import("../types.ts").AgentCommandInputSchema} for RPC transport. */
export const AgentCommandInputSchema = z.object({
  args: z.record(z.string(), AgentCommandArgumentSchema).optional().readonly(),
  positionals: z.array(AgentCommandPositionalSchema).optional().readonly(),
  remainder: AgentCommandRemainderSchema.optional().readonly(),
  allowAttachments: z.boolean().optional(),
});

export const AvailableAgentCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: AgentCommandInputSchema.readonly(),
});

export type AvailableAgentCommand = z.infer<typeof AvailableAgentCommandSchema>;
export type AgentCommandArgument = z.infer<typeof AgentCommandArgumentSchema>;
export type AgentCommandPositional = z.infer<typeof AgentCommandPositionalSchema>;
export type AgentCommandRemainder = z.infer<typeof AgentCommandRemainderSchema>;
export type AgentCommandInput = z.infer<typeof AgentCommandInputSchema>;

export default {
  name: "Agent RPC",
  path: "/rpc/agent",
  methods: {
    getAgentConfig: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [SuccessSchema.extend(AgentConfigSchema.shape), AgentNotFoundSchema]),
    },
    getAgentEvents: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        fromPosition: z.number(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          events: z.array(AgentEventEnvelopeSchema),
          position: z.number(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    streamAgentEvents: {
      type: "stream",
      input: z.object({
        agentId: z.string(),
        fromPosition: z.number(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          events: z.array(AgentEventEnvelopeSchema),
          position: z.number(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    listAgents: {
      type: "query",
      input: z.object({}),
      result: z.array(AgentListEntrySchema),
    },
    streamAgents: {
      type: "stream",
      input: z.object({}),
      result: z.array(AgentListEntrySchema),
    },
    getAgentTypes: {
      type: "query",
      input: z.object({}),
      result: z.array(
        z.object({
          type: z.string(),
          displayName: z.string(),
          description: z.string(),
          category: z.string().exactOptional(),
          enabledTools: z.array(z.string()).default([]),
        }),
      ),
    },
    createAgent: {
      type: "mutation",
      input: z.object({
        agentType: z.string(),
        headless: z.boolean(),
      }),
      result: z.object({
        id: z.string(),
        displayName: z.string(),
        description: z.string(),
      }),
    },
    deleteAgent: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        reason: z.string(),
      }),
      result: z.discriminatedUnion("status", [SuccessSchema, AgentNotFoundSchema]),
    },
    sendInput: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        input: InputMessageSchema,
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          requestId: z.string(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    sendInteractionResponse: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        response: InteractionResponseSchema,
      }),
      result: z.discriminatedUnion("status", [SuccessSchema, AgentNotFoundSchema]),
    },
    abortCurrentOperation: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        message: z.string(),
      }),
      result: z.discriminatedUnion("status", [SuccessSchema, AgentNotFoundSchema]),
    },
    getCommandHistory: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          history: z.array(z.string()),
        }),
        AgentNotFoundSchema,
      ]),
    },
    getAvailableCommands: {
      type: "query",
      /** When `agentId` is omitted, commands are listed from the app-level registry (same set agents use). */
      input: z.object({
        agentId: z.string().optional(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          commands: z.array(AvailableAgentCommandSchema),
        }),
        AgentNotFoundSchema,
      ]),
    },
  },
} satisfies RPCSchema;
