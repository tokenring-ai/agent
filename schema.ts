import z from "zod";

export const TodoStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export const TodoItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: TodoStatusSchema,
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const AgentCommandConfigSchema = z.object({
  /** Custom command name (defaults to agentType if not provided) */
  name: z.string().optional(),
  /** Custom command description (defaults to agent description if not provided) */
  description: z.string().optional(),
  /** Custom help text for the command */
  help: z.string().optional(),
  /** Whether to run in background mode by default */
  background: z.boolean().default(false),
  /** Whether to forward chat output */
  forwardChatOutput: z.boolean().default(true),
  /** Whether to forward system output */
  forwardSystemOutput: z.boolean().default(true),
  /** Whether to forward human requests */
  forwardHumanRequests: z.boolean().default(true),
  /** Whether to forward reasoning output */
  forwardReasoning: z.boolean().default(false),
  /** Whether to forward input commands */
  forwardInputCommands: z.boolean().default(true),
  /** Whether to forward artifacts */
  forwardArtifacts: z.boolean().default(false),
});
export type AgentCommandConfig = z.infer<typeof AgentCommandConfigSchema>;

export const AgentConfigSchema = z.object({
  agentType: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.string(),
  debug: z.boolean().default(false),
  workHandler: z.function({
    input: z.tuple([z.string(), z.any()]),
    output: z.any()
  }).optional(),
  initialCommands: z.array(z.string()).default([]),
  createMessage: z.string().default("Agent Created"),
  headless: z.boolean().default(false),
  //type: z.enum(["interactive", "background"]),
  callable: z.boolean().default(true),
  /** Register this agent as a callable command */
  command: AgentCommandConfigSchema.optional(),
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

export const AgentPackageConfigSchema = z.object({
  app: z.array(AgentConfigSchema.loose()).optional(),
  user: z.array(AgentConfigSchema.loose()).optional(),
});

export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;
