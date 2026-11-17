import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { JobRecordSchema, JobStatusSchema } from "../schema.ts";

const JobListInputSchema = z.object({
  owner: z.string().exactOptional(),
  status: z.array(JobStatusSchema).exactOptional(),
  rootJobId: z.string().exactOptional(),
  limit: z.number().int().min(1).max(1000).exactOptional(),
});

const JobPolicySchema = z.object({
  /** The approval level unattended jobs auto-approve up to unless they ask for more (never above the ceiling). */
  defaultApprovalLevel: z.number().int(),
  /** The highest level any schedule or queue may be allowed (at most 7). */
  approvalCeiling: z.number().int(),
  defaultMaxCostUsd: z.number().nullable(),
  /** Whether an approval escalation target is set, so questions from unattended runs can reach a person. */
  escalationConfigured: z.boolean(),
});

export const JobRollupInputSchema = z.object({
  /** Window length counted back from now (default 7, at most 90). */
  days: z.number().int().min(1).max(90).exactOptional(),
  owner: z.string().exactOptional(),
  /** schedule: scheduler jobs per schedule; queue: queue jobs per queue; day: per local calendar day; owner: per plugin. */
  groupBy: z.enum(["schedule", "queue", "workflow", "day", "owner"]),
});

export const JobRollupRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  runs: z.number().int(),
  /** Jobs still queued or running (counted in `runs`, in none of the outcome counts). */
  active: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
  interrupted: z.number().int(),
  cancelled: z.number().int(),
  refusedActions: z.number().int(),
  /** Null when no job in the row reported a cost: never a made-up zero. */
  totalCostUsd: z.number().nullable(),
  /** Jobs that have started but have no cost figure. */
  costUnavailableJobs: z.number().int(),
  averageDurationMs: z.number().nullable(),
  lastRunAt: z.number().nullable(),
  lastStatus: JobStatusSchema.nullable(),
});

export const JobRollupSchema = z.object({
  days: z.number().int(),
  since: z.number(),
  groupBy: z.enum(["schedule", "queue", "workflow", "day", "owner"]),
  /** True when the engine's capped record list (newest 1000) does not reach back to `since`: older jobs are missing. */
  truncated: z.boolean(),
  rows: z.array(JobRollupRowSchema),
  totals: JobRollupRowSchema,
});

export type JobRollupInput = z.output<typeof JobRollupInputSchema>;
export type JobRollupRow = z.output<typeof JobRollupRowSchema>;
export type JobRollup = z.output<typeof JobRollupSchema>;

const JobListSchema = z.object({ jobs: z.array(JobRecordSchema) });

/** Unattended agent jobs across every plugin (queue, tasks, workflow, scheduler). */
export default {
  name: "Agent Jobs RPC",
  path: "/rpc/agent-jobs",
  methods: {
    listJobs: {
      type: "query",
      input: JobListInputSchema,
      result: JobListSchema,
    },
    streamJobs: {
      type: "stream",
      input: JobListInputSchema,
      result: JobListSchema,
    },
    getJobPolicy: {
      type: "query",
      input: z.object({}),
      result: JobPolicySchema,
    },
    getJobRollup: {
      type: "query",
      input: JobRollupInputSchema,
      result: JobRollupSchema,
    },
    cancelJob: {
      type: "mutation",
      input: z.object({ jobId: z.string(), reason: z.string().exactOptional() }),
      result: SuccessSchema.extend({ cancelled: z.boolean() }),
    },
  },
} satisfies RPCSchema;
