import z from "zod";

export const TodoStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export const TodoItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: TodoStatusSchema,
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string(),
  debug: z.boolean().default(false),
  workHandler: z.function({
    input: z.tuple([z.string(), z.any()]),
    output: z.any()
  }).optional(),
  agentType: z.string().optional(),
  initialCommands: z.array(z.string()).default([]),
  createMessage: z.string().default("Agent Created"),
  headless: z.boolean().default(false),
  //type: z.enum(["interactive", "background"]),
  callable: z.boolean().default(true),
  minimumRunning: z.number().default(0),
  idleTimeout: z.number().default(0), // In seconds
  maxRunTime: z.number().default(0), // In seconds
  subAgent: z.object({
    forwardChatOutput: z.boolean().default(true),
    forwardSystemOutput: z.boolean().default(true),
    forwardHumanRequests: z.boolean().default(true),
    forwardReasoning: z.boolean().default(false),
    forwardInputCommands: z.boolean().default(true),
    forwardArtifacts: z.boolean().default(false),
    timeout: z.number().default(0),
    maxResponseLength: z.number().default(10000),
    minContextLength: z.number().default(1000),
  }).prefault({}),
  allowedSubAgents: z.array(z.string()).default([]),
  enabledHooks: z.array(z.string()).default([]),
  todos: z.object({
    copyToChild: z.boolean().default(true),
    initialItems: z.array(TodoItemSchema).default([]),
  }).prefault({}),
});

export const AgentPackageConfigSchema = z
  .record(z.string(), AgentConfigSchema.loose())
  .optional();
export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;
