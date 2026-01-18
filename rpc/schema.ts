import omit from "@tokenring-ai/utility/object/omit";
import {JsonRPCSchema} from "@tokenring-ai/web-host/jsonrpc/types";
import {z} from "zod";
import {AgentEventEnvelopeSchema, QuestionRequestSchema, QuestionResponseSchema} from "../AgentEvents.ts";
import {AgentConfigSchema} from "../schema.ts";

export default {
  path: "/rpc/agent",
  methods: {
    getAgent: {
      type: "query",
      input: z.object({
        agentId: z.string()
      }),
      result: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        debugEnabled: z.boolean(),
        config: z.object(omit(AgentConfigSchema.shape, ["workHandler"]))
      })
    },
    getAgentEvents: {
      type: "query",
      input: z.object({
        agentId: z.string(),
        fromPosition: z.number()
      }),
      result: z.object({
        events: z.array(AgentEventEnvelopeSchema),
        position: z.number()
      })
    },
    streamAgentEvents: {
      type: "stream",
      input: z.object({
        agentId: z.string(),
        fromPosition: z.number()
      }),
      result: z.object({
        events: z.array(AgentEventEnvelopeSchema),
        position: z.number()
      })
    },
    getAgentExecutionState: {
      type: "query",
      input: z.object({
        agentId: z.string()
      }),
      result: z.object({
        idle: z.boolean(),
        busyWith: z.string().nullable(),
        waitingOn: z.array(QuestionRequestSchema),
        statusLine: z.string().nullable()
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
        waitingOn: z.array(QuestionRequestSchema),
        statusLine: z.string().nullable()
      })
    },
    listAgents: {
      type: "query",
      input: z.object({}),
      result: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        idle: z.boolean(),
        statusMessage: z.string()
      }))
    },
    getAgentTypes: {
      type: "query",
      input: z.object({}),
      result: z.array(z.object({
        type: z.string(),
        name: z.string(),
        description: z.string(),
        category: z.string().optional(),
        callable: z.boolean().optional(),
      }))
    },
    createAgent: {
      type: "mutation",
      input: z.object({
        agentType: z.string(),
        headless: z.boolean(),
      }),
      result: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
      })
    },
    deleteAgent: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      })
    },
    sendInput: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        message: z.string(),
      }),
      result: z.object({
        requestId: z.string(),
      })
    },
    sendQuestionResponse: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        requestId: z.string(),
        response: QuestionResponseSchema
      }),
      result: z.object({
        success: z.boolean(),
      })
    },
    abortAgent: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        reason: z.string().default("User requested abort"),
      }),
      result: z.object({
        success: z.boolean(),
      })
    },
    resetAgent: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        what: z.array(z.string()),
      }),
      result: z.object({
        success: z.boolean(),
      })
    }
  }
} satisfies JsonRPCSchema;
