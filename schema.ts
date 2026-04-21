import z from "zod";

export const SubAgentConfigSchema = z.object({
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
});

export type SubAgentConfig = z.input<typeof SubAgentConfigSchema>;
export type ParsedSubAgentConfig = z.output<typeof SubAgentConfigSchema>;

export const AgentCommandConfigSchema = z.object({
  /** Type of agent used to execute the tool */
  agentType: z.string(),
  /** Custom command description (defaults to agent description if not provided) */
  description: z.string(),
  /** Command input schema */
  commandSchema: z
    .object({
      remainder: z
        .object({
          name: z.string().default("prompt"),
          description: z.string().default(`Prompt to send to the agent`),
          required: z.boolean().default(true),
        })
        .prefault({}),
    })
    .prefault({}),
  /** Custom help text for the command */
  help: z.string().exactOptional(),
  /** Whether to run in background mode by default */
  background: z.boolean().default(false),
  /** The steps to execute */
  steps: z.array(z.string()).min(1),
  /** The subagent configuration */
  subAgent: SubAgentConfigSchema.prefault({}),
});
export type AgentCommandConfig = z.input<typeof AgentCommandConfigSchema>;
export type ParsedAgentCommandConfig = z.output<typeof AgentCommandConfigSchema>;

export const AgentConfigSchema = z.object({
  agentType: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.string(),
  debug: z.boolean().default(false),
  initialCommands: z.array(z.string()).default([]),
  createMessage: z.string().default("Agent Created"),
  headless: z.boolean().default(false),
  minimumRunning: z.number().default(0),
  idleTimeout: z.number().default(0), // In seconds
  maxRunTime: z.number().default(0), // In seconds
});

export const AgentPackageConfigSchema = z.object({
  agents: z
    .record(
      z.string(),
      AgentConfigSchema.omit({
        agentType: true,
      }).loose(),
    )
    .default({}),
  commands: z.record(z.string(), AgentCommandConfigSchema).default({}),
});

export type AgentPackageConfig = z.input<typeof AgentPackageConfigSchema>;

export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;
export const AgentNotFoundSchema = z.object({
  status: z.literal("agentNotFound"),
});
