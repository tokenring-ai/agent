import { AgentNotFoundSchema } from "@tokenring-ai/rpc/types";
import { SuccessSchema } from "@tokenring-ai/rpc/types";
import type { RPCSchema } from "@tokenring-ai/rpc/types";
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
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          commands: z.array(
            z.object({
              name: z.string(),
              description: z.string(),
            }),
          ),
        }),
        AgentNotFoundSchema,
      ]),
    },
  },
} satisfies RPCSchema;
