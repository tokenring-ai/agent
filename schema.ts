import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import z from "zod";

export const SubAgentConfigSchema = z.object({
  forwardChatOutput: z.boolean().default(false),
  forwardStatusMessages: z.boolean().default(true),
  forwardSystemOutput: z.boolean().default(false),
  forwardHumanRequests: z.boolean().default(true),
  forwardReasoning: z.boolean().default(false),
  forwardInputCommands: z.boolean().default(true),
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
  /**
   * When false (default) and the current agent already has the command's agentType,
   * steps run in the foreground on the current agent instead of spawning a sub-agent.
   * When true, or when the agent type differs, a new agent of the target type is used.
   */
  requireNewAgent: z.boolean().default(false),
  /** The steps to execute */
  steps: z.array(z.string()).min(1),
  /** The subagent configuration */
  subAgent: SubAgentConfigSchema.prefault({}),
});
export type AgentCommandConfig = z.input<typeof AgentCommandConfigSchema>;
export type ParsedAgentCommandConfig = z.output<typeof AgentCommandConfigSchema>;

export const AgentConfigSchema = z.object({
  agentType: z.string(),
  displayName: z.string().meta({ description: "Human-readable name shown in agent pickers" }),
  description: z.string().meta({ description: "What this agent type is for" }),
  category: z.string().meta({ description: "Group this agent type appears under in pickers" }),
  defaultCommand: z.string().default("/chat send").meta({ description: "The default command to run when the message to the agent does not start with a '/'" }),
  debug: z.boolean().default(false).meta({ advanced: true, description: "Log extra diagnostic output for this agent type" }),
  initialCommands: z.array(z.string()).default([]).meta({ description: "Commands run automatically when an agent of this type starts" }),
  createMessage: z.string().default("Agent Created").meta({ advanced: true, description: "Message logged when an agent of this type is created" }),
  minimumRunning: z.number().min(0).default(0).meta({ description: "Keep at least this many agents of this type running" }),
  idleTimeout: z.number().min(0).default(0).meta({ unit: "s", description: "Shut idle agents down after this long (0 disables)" }),
  maxRunTime: z.number().min(0).default(0).meta({ unit: "s", description: "Hard limit on agent runtime (0 disables)" }),
});

/** Where an agent came from: shipped with the app/plugins, or authored in the workspace agent directory. */
export const AgentSourceSchema = z.enum(["bundled", "workspace"]);

export type AgentSource = z.output<typeof AgentSourceSchema>;

/**
 * Provenance stamped onto anything installed from a marketplace registry — an agent, a tool, a
 * workflow, or a skill. It lives here rather than in the marketplace package because agents, tools,
 * workflows, and skills all already depend on this one, and the marketplace depends on all of them;
 * putting it the other way round would make the dependency graph a cycle.
 */
export const InstallSourceSchema = z.object({
  /** Registry the item came from, e.g. "tokenring-ai/community". */
  registry: z.string(),
  /** Marketplace item id, `<kind>/<category>/<name>`, e.g. "agent/coding/code-reviewer". */
  id: z.string(),
  version: z.string().default(""),
  author: z.string().default(""),
  /** ISO timestamp of the install. */
  installedAt: z.string(),
});

export type InstallSource = z.output<typeof InstallSourceSchema>;

/**
 * The contents of a single agent YAML file in the agent directory. The agent type comes from the
 * file name, so it is not part of the file body.
 *
 * Loose on purpose: every plugin bolts its own slice onto an agent config (`chat`, `filesystem`,
 * `scheduler`, …) and reads it back with {@link import("./Agent.ts").default.getAgentConfigSlice},
 * so unknown keys have to survive the round trip through disk.
 */
export const AgentItemSchema = AgentConfigSchema.omit({ agentType: true })
  .extend({
    installedFrom: InstallSourceSchema.exactOptional(),
  })
  .loose();

export type AgentItem = z.output<typeof AgentItemSchema>;
export type AgentItemInput = z.input<typeof AgentItemSchema>;

/** An agent as read from the agent directory: the file body plus its name and last-modified time. */
export const AgentDefinitionSchema = AgentItemSchema.extend({
  name: z.string(),
  updatedAt: z.string(),
});

export type AgentDefinition = z.output<typeof AgentDefinitionSchema>;

/** Limits for unattended agent jobs (queue items, task dispatches, workflow runs, scheduled runs). */
export const AgentJobsConfigSchema = z
  .object({
    maxDepth: z
      .number()
      .int()
      .min(1)
      .default(3)
      .meta({ description: "How deep jobs may nest: a job started by a job started by a job is depth 3" } satisfies ConfigFieldMeta),
    maxConcurrent: z
      .number()
      .int()
      .min(1)
      .default(8)
      .meta({ description: "Job agents running at once across the whole app" } satisfies ConfigFieldMeta),
    maxDescendants: z
      .number()
      .int()
      .min(0)
      .default(20)
      .meta({ description: "Jobs one top-level job, and everything it starts, may start in total" } satisfies ConfigFieldMeta),
    timeoutSeconds: z
      .number()
      .int()
      .min(0)
      .default(1800)
      .meta({ unit: "s", description: "Default time limit for a job (0 disables); jobs may set their own" } satisfies ConfigFieldMeta),
    maxAutoApprovalLevel: z
      .number()
      .int()
      .min(0)
      .max(10)
      .default(5)
      .meta({
        description: "Highest tool safety level a job agent may auto-approve, whatever the person or agent that started it allows",
      } satisfies ConfigFieldMeta),
    approvalCeiling: z
      .number()
      .int()
      .min(0)
      .max(7)
      .default(5)
      .meta({
        description:
          "Highest approval level any schedule or queue may be allowed to auto-approve in an unattended run (at most 7: levels 8 and above always need a person and are refused when nobody can answer)",
      } satisfies ConfigFieldMeta),
    defaultMaxCostUsd: z
      .number()
      .positive()
      .exactOptional()
      .meta({
        unit: "USD",
        description: "Spending limit applied to every job that sets none of its own; a job over it stops and is marked failed (unset: no limit)",
      } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Agent jobs", description: "Limits for agents that work unattended" } satisfies ConfigFieldMeta);

export type ParsedAgentJobsConfig = z.output<typeof AgentJobsConfigSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled", "interrupted"]);
export type JobStatus = z.output<typeof JobStatusSchema>;

/** Who started a job, as recorded (an agent is kept by id: it may be gone when the record is read). */
export const JobRecordOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), agentId: z.string(), agentType: z.string() }),
  z.object({ kind: z.literal("person"), label: z.string() }),
  z.object({ kind: z.literal("schedule"), scheduleId: z.string() }),
]);

/** Refusals kept on a job record; the rest are only counted. */
export const MAX_JOB_REFUSALS = 20;

/** An action the job's approval policy refused instead of asking a person. */
export const JobRefusalSchema = z.object({
  tool: z.string(),
  message: z.string(),
  level: z.number(),
  /** Permission id of the refused request when one "Allow" could grant (see the chat plugin's permission grants). */
  permissionId: z.string().exactOptional(),
  /** Plain-language scope of {@link permissionId}, e.g. "Publish posts on mysite". */
  permissionSummary: z.string().exactOptional(),
});
export type JobRefusal = z.output<typeof JobRefusalSchema>;

/** Defaulted questions kept on a job record; the rest are only counted. */
export const MAX_JOB_UNANSWERED = 20;

/** A non-approval question nobody answered, so it took its default (approvals go to `refusals`). */
export const JobUnansweredSchema = z.object({
  /** What was asked, short. */
  question: z.string(),
  /** The default the agent went on with, short; "(no answer)" when the question had none. */
  answer: z.string(),
  /** "deadline": nobody answered in time. "nobody": nobody could be asked, so it defaulted at once. */
  reason: z.enum(["deadline", "nobody"]),
  at: z.number(),
});
export type JobUnanswered = z.output<typeof JobUnansweredSchema>;

export const JobRecordSchema = z.object({
  id: z.string(),
  owner: z.string(),
  label: z.string(),
  /** Where the owner keeps the job's entry (queue `{ queue }`, tasks `{ board, task }`, workflow `{ run }`, scheduler `{ schedule }`). */
  ownerRef: z.record(z.string(), z.string()).default({}),
  agentType: z.string(),
  origin: JobRecordOriginSchema,
  parentJobId: z.string().nullable(),
  /** The top-level job of this job's tree (its own id for a top-level job). */
  rootJobId: z.string(),
  /** 1 for a job nothing else's job started; a job's child is one deeper. */
  depth: z.number(),
  status: JobStatusSchema,
  /** When the job was asked for (it may then have queued for a free slot). */
  requestedAt: z.number(),
  /** When its agent started; null while queued. */
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  summary: z.string(),
  error: z.string().nullable(),
  costUsd: z.number().nullable(),
  tokens: z.number().nullable(),
  agentId: z.string().nullable(),
  /** The spending limit the job runs under (its own, else `agent.jobs.defaultMaxCostUsd`); null: none. */
  maxCostUsd: z.number().nullable().default(null),
  /** The highest approval level the job may auto-approve; actions above it are refused. Null: not known. */
  approvalLevel: z.number().nullable().default(null),
  /** Approvals the job's policy refused (unattended: nobody to ask, or nobody answered). The first {@link MAX_JOB_REFUSALS} are kept. */
  refusals: z.array(JobRefusalSchema).default([]),
  /** How many approvals were refused in all (may exceed `refusals.length`). */
  refusalCount: z.number().int().default(0),
  /** Questions (not approvals) nobody answered, which took their default. The first {@link MAX_JOB_UNANSWERED} are kept. */
  unanswered: z.array(JobUnansweredSchema).default([]),
  /** How many questions took their default in all (may exceed `unanswered.length`). */
  unansweredCount: z.number().int().default(0),
});

export type JobRecord = z.output<typeof JobRecordSchema>;

export const AgentPackageConfigSchema = z.object({
  agent: z
    .object({
      jobs: AgentJobsConfigSchema,
    })
    .prefault({})
    .meta({ label: "Agent engine", description: "Settings for how agents run" } satisfies ConfigFieldMeta),
  agents: z
    .record(
      z.string(),
      AgentConfigSchema.omit({
        agentType: true,
      }).loose(),
    )
    .default({})
    .meta({ label: "Agent Types", description: "Agent type definitions, keyed by type name" }),
  commands: z
    .record(z.string(), AgentCommandConfigSchema)
    .default({})
    .meta({ label: "Agent Commands", description: "Reusable multi-step commands, keyed by command name" }),
  agentDirectory: z
    .string()
    .default("agents")
    .meta({ description: "Directory where editable agent YAML files are stored" } satisfies ConfigFieldMeta),
});

export type AgentPackageConfig = z.input<typeof AgentPackageConfigSchema>;
export type ParsedAgentPackageConfig = z.output<typeof AgentPackageConfigSchema>;

export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type ParsedAgentConfig = z.output<typeof AgentConfigSchema>;
