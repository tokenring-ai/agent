import z from "zod";

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

export const SubAgentConfigSchema = z.object({
  allowedSubAgents: z.array(z.string()).default([]),
  forwardChatOutput: z.boolean().default(false),
  forwardStatusMessages: z.boolean().default(true),
  forwardSystemOutput: z.boolean().default(false),
  forwardHumanRequests: z.boolean().default(true),
  forwardReasoning: z.boolean().default(false),
  forwardInputCommands: z.boolean().default(true),
  forwardArtifacts: z.boolean().default(false),
  timeout: z.number().default(0),
  maxResponseLength: z.number().default(10000),
  minContextLength: z.number().default(1000),
}).prefault({});

export type SubAgentConfig = z.input<typeof SubAgentConfigSchema>;
export type ParsedSubAgentConfig = z.output<typeof SubAgentConfigSchema>;

export const AgentConfigSchema = z.object({
  agentType: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.string(),
  debug: z.boolean().default(false),
  workHandler: z.array(z.string()).optional(),
  initialCommands: z.array(z.string()).default([]),
  createMessage: z.string().default("Agent Created"),
  headless: z.boolean().default(false),
  callable: z.boolean().default(true),
  /** Register this agent as a callable command */
  command: AgentCommandConfigSchema.optional(),
  minimumRunning: z.number().default(0),
  idleTimeout: z.number().default(0), // In seconds
  maxRunTime: z.number().default(0), // In seconds
  subAgent: SubAgentConfigSchema,
});

export const AgentPackageConfigSchema = z.object({
  agents: z.record(
    z.string(),
    AgentConfigSchema.omit({
      agentType: true
    }).loose()
  ).default({}),
});

export type AgentPackageConfig = z.input<typeof AgentPackageConfigSchema>;

export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;
