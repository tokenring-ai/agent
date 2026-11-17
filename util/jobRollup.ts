import type { JobRollup, JobRollupInput, JobRollupRow } from "../rpc/jobs.schema.ts";
import type { JobRecord, JobStatus } from "../schema.ts";

const DAY_MS = 86_400_000;
const OWNER_LABEL: Record<string, string> = { tasks: "Tasks", queue: "Queue", workflow: "Workflow", scheduler: "Scheduler" };

export type RollupOptions = Pick<JobRollupInput, "groupBy"> & {
  days?: number | undefined;
  now: number;
  /** How many records the engine keeps; a full list means older jobs may have been dropped. */
  recordCap: number;
  /** The unfiltered record list when `jobs` was filtered by owner, so truncation is judged on the whole list. */
  allRecords?: readonly JobRecord[] | undefined;
};

function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Which group a job belongs to, or null when the grouping does not apply to it. */
function groupOf(job: JobRecord, groupBy: JobRollupInput["groupBy"]): { key: string; label: string } | null {
  switch (groupBy) {
    case "schedule": {
      if (job.owner !== "scheduler") return null;
      const name = job.ownerRef.schedule ?? (job.origin.kind === "schedule" ? job.origin.scheduleId : job.label);
      return { key: name, label: name };
    }
    case "queue": {
      if (job.owner !== "queue") return null;
      const name = job.ownerRef.queue ?? "(unknown queue)";
      return { key: name, label: name };
    }
    case "workflow": {
      if (job.owner !== "workflow") return null;
      // Older records carry only the label ("<workflow> run <uuid>").
      const name = job.ownerRef.workflow ?? job.label.replace(/ run [0-9a-f-]{36}$/i, "");
      return { key: name, label: name };
    }
    case "day": {
      const day = localDay(job.requestedAt);
      return { key: day, label: day };
    }
    case "owner":
      return { key: job.owner, label: OWNER_LABEL[job.owner] ?? job.owner.charAt(0).toUpperCase() + job.owner.slice(1) };
  }
}

type Acc = {
  row: JobRollupRow;
  costJobs: number;
  durations: number[];
};

function emptyAcc(key: string, label: string): Acc {
  return {
    costJobs: 0,
    durations: [],
    row: {
      key,
      label,
      runs: 0,
      active: 0,
      succeeded: 0,
      failed: 0,
      interrupted: 0,
      cancelled: 0,
      refusedActions: 0,
      totalCostUsd: null,
      costUnavailableJobs: 0,
      averageDurationMs: null,
      lastRunAt: null,
      lastStatus: null,
    },
  };
}

function add(acc: Acc, job: JobRecord): void {
  const row = acc.row;
  row.runs++;
  const status: JobStatus = job.status;
  if (status === "queued" || status === "running") row.active++;
  else row[status]++;
  row.refusedActions += job.refusalCount;
  if (job.costUsd !== null) {
    row.totalCostUsd = (row.totalCostUsd ?? 0) + job.costUsd;
    acc.costJobs++;
  } else if (status !== "queued") {
    row.costUnavailableJobs++;
  }
  if (job.startedAt !== null && job.endedAt !== null) acc.durations.push(Math.max(0, job.endedAt - job.startedAt));
  if (row.lastRunAt === null || job.requestedAt >= row.lastRunAt) {
    row.lastRunAt = job.requestedAt;
    row.lastStatus = status;
  }
}

function finish(acc: Acc): JobRollupRow {
  if (acc.durations.length > 0) acc.row.averageDurationMs = Math.round(acc.durations.reduce((a, b) => a + b, 0) / acc.durations.length);
  return acc.row;
}

/**
 * Totals of job records inside the window `[now - days, now]` (by when each job was asked for),
 * grouped by schedule, queue, day or owner. Pure: no clock, no service.
 */
export function rollupJobs(jobs: readonly JobRecord[], options: RollupOptions): JobRollup {
  const days = Math.min(90, Math.max(1, Math.floor(options.days ?? 7)));
  const since = options.now - days * DAY_MS;
  const groups = new Map<string, Acc>();
  const total = emptyAcc("total", "Total");
  for (const job of jobs) {
    if (job.requestedAt < since || job.requestedAt > options.now) continue;
    const group = groupOf(job, options.groupBy);
    if (!group) continue;
    let acc = groups.get(group.key);
    if (!acc) {
      acc = emptyAcc(group.key, group.label);
      groups.set(group.key, acc);
    }
    add(acc, job);
    add(total, job);
  }
  const rows = [...groups.values()].map(finish);
  if (options.groupBy === "day") rows.sort((a, b) => b.key.localeCompare(a.key));
  else rows.sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0) || a.label.localeCompare(b.label));

  const covered = options.allRecords ?? jobs;
  const oldest = covered.reduce<number | null>((min, job) => (min === null || job.requestedAt < min ? job.requestedAt : min), null);
  const truncated = covered.length >= options.recordCap && oldest !== null && oldest > since;
  return { days, since, groupBy: options.groupBy, truncated, rows, totals: finish(total) };
}
