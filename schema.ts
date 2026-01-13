import z from "zod";

export const AgentConfigSchema = z.looseObject({
  name: z.string(),
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
  type: z.enum(["interactive", "background"]),
  callable: z.boolean().default(true),
  idleTimeout: z.number().optional().default(86400), // In seconds
  maxRunTime: z.number().default(0) // In seconds
});
export const AgentPackageConfigSchema = z
  .record(z.string(), AgentConfigSchema)
  .optional();
export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;