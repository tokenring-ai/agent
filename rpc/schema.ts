import type {RPCSchema} from "@tokenring-ai/rpc/types";
import {z} from "zod";
import {AgentEventEnvelopeSchema, InputMessageSchema, InteractionResponseSchema} from "../AgentEvents.ts";
import {AgentConfigSchema} from "../schema.ts";

export const AgentNotFoundSchema = z.object({
  status: z.literal('agentNotFound'),
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
      result: z.discriminatedUnion("status", [
        AgentConfigSchema.extend({status: z.literal('success')}),
        AgentNotFoundSchema
      ])
    },
    getAgentEvents: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        fromPosition: z.number(),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          events: z.array(AgentEventEnvelopeSchema),
          position: z.number(),
        }),
        AgentNotFoundSchema
      ])
    },
    streamAgentEvents: {
      type: "stream",
      input: z.object({
        agentId: z.string(),
        fromPosition: z.number(),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          events: z.array(AgentEventEnvelopeSchema),
          position: z.number(),
        }),
        AgentNotFoundSchema
      ])
    },
    /*
    getAgentExecutionState: {
      type: "query",
      input: z.object({
        agentId: z.string()
      }),
      result: z.object({
        idle: z.boolean(),
        busyWith: z.string().nullable(),
        waitingOn: z.array(InteractionSchema),
      })
    },
    streamAgentExecutionState: {
      type: "stream",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.object({
        idle: z.boolean(),
        busyWith: z.string().nullable(),
        waitingOn: z.array(InteractionSchema),
      })
    },*/
    listAgents: {
      type: "query",
      input: z.object({}),
      result: z.array(
        z.object({
          id: z.string(),
          displayName: z.string(),
          description: z.string(),
          idle: z.boolean(),
          currentActivity: z.string(),
        }),
      ),
    },
    getAgentTypes: {
      type: "query",
      input: z.object({}),
      result: z.array(
        z.object({
          type: z.string(),
          displayName: z.string(),
          description: z.string(),
          category: z.string().optional(),
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
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
        }),
        AgentNotFoundSchema
      ])
    },
    sendInput: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        input: InputMessageSchema,
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          requestId: z.string(),
        }),
        AgentNotFoundSchema
      ])
    },
    sendInteractionResponse: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        response: InteractionResponseSchema,
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
        }),
        AgentNotFoundSchema
      ])
    },
    abortCurrentOperation: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        message: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
        }),
        AgentNotFoundSchema
      ])
    },
    getCommandHistory: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          history: z.array(z.string()),
        }),
        AgentNotFoundSchema
      ])
    },
    getAvailableCommands: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          commands: z.array(z.string()),
        }),
        AgentNotFoundSchema
      ])
    },
  },
} satisfies RPCSchema;
