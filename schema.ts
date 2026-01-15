import z from "zod";

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
  maxRunTime: z.number().default(0) // In seconds
});

export const AgentPackageConfigSchema = z
  .record(z.string(), AgentConfigSchema.loose())
  .optional();
export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;