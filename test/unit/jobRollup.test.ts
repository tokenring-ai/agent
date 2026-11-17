import { describe, expect, it } from "bun:test";
import type { JobRecord } from "../../schema.ts";
import { rollupJobs } from "../../util/jobRollup.ts";

const NOW = new Date(2026, 10, 16, 12, 0, 0).getTime();
const H = 3_600_000;
const DAY = 24 * H;
let n = 0;

function job(o: Partial<JobRecord> = {}): JobRecord {
  const id = `j${++n}`;
  return {
    id,
    owner: "scheduler",
    label: "x",
    ownerRef: { schedule: "nightly" },
    agentType: "code",
    origin: { kind: "schedule", scheduleId: "nightly" },
    parentJobId: null,
    rootJobId: id,
    depth: 1,
    status: "succeeded",
    requestedAt: NOW - H,
    startedAt: NOW - H,
    endedAt: NOW - H + 60_000,
    summary: "",
    error: null,
    costUsd: 0.5,
    tokens: null,
    agentId: null,
    maxCostUsd: null,
    approvalLevel: null,
    refusals: [],
    refusalCount: 0,
    unanswered: [],
    unansweredCount: 0,
    ...o,
  };
}

const opts = { now: NOW, recordCap: 1000 };

describe("rollupJobs", () => {
  it("groups by schedule, counts outcomes, sums cost and refusals", () => {
    const r = rollupJobs(
      [
        job(),
        job({ status: "failed", costUsd: 0.25, refusalCount: 2, requestedAt: NOW - 2 * H, endedAt: NOW - 2 * H + 120_000, startedAt: NOW - 2 * H }),
        job({ status: "interrupted" }),
        job({ status: "cancelled" }),
        job({ ownerRef: { schedule: "weekly" }, status: "running", endedAt: null }),
        job({ owner: "queue", ownerRef: { queue: "docs" } }),
      ],
      { ...opts, groupBy: "schedule" },
    );
    expect(r.rows.map(x => x.key).sort()).toEqual(["nightly", "weekly"]);
    const nightly = r.rows.find(x => x.key === "nightly")!;
    expect(nightly).toMatchObject({ runs: 4, succeeded: 1, failed: 1, interrupted: 1, cancelled: 1, refusedActions: 2, totalCostUsd: 1.75 });
    expect(nightly.averageDurationMs).toBe(75_000);
    expect(r.rows.find(x => x.key === "weekly")).toMatchObject({ active: 1, succeeded: 0, lastStatus: "running" });
    expect(r.totals.runs).toBe(5);
  });

  it("uses null, not zero, when no cost is known, and counts jobs without cost", () => {
    const r = rollupJobs([job({ costUsd: null }), job({ costUsd: null, status: "failed" })], { ...opts, groupBy: "schedule" });
    expect(r.rows[0]).toMatchObject({ totalCostUsd: null, costUnavailableJobs: 2 });
    const mixed = rollupJobs([job({ costUsd: null }), job({ costUsd: 0 })], { ...opts, groupBy: "owner" });
    expect(mixed.totals).toMatchObject({ totalCostUsd: 0, costUnavailableJobs: 1 });
  });

  it("respects the window", () => {
    const jobs = [job({ requestedAt: NOW - 2 * DAY }), job({ requestedAt: NOW - 10 * DAY })];
    expect(rollupJobs(jobs, { ...opts, groupBy: "owner", days: 1 }).totals.runs).toBe(0);
    expect(rollupJobs(jobs, { ...opts, groupBy: "owner", days: 7 }).totals.runs).toBe(1);
    expect(rollupJobs(jobs, { ...opts, groupBy: "owner", days: 500 }).days).toBe(90);
    expect(rollupJobs(jobs, { ...opts, groupBy: "owner" }).days).toBe(7);
  });

  it("groups by day (newest first) and by owner", () => {
    const jobs = [job({ requestedAt: NOW - 1 * H }), job({ requestedAt: NOW - DAY - H }), job({ owner: "queue", ownerRef: { queue: "q" } })];
    const day = rollupJobs(jobs, { ...opts, groupBy: "day" });
    expect(day.rows.map(x => x.key)).toEqual(["2026-11-16", "2026-11-15"]);
    expect(day.rows[0]?.runs).toBe(2);
    const owner = rollupJobs(jobs, { ...opts, groupBy: "owner" });
    expect(owner.rows.map(x => x.label).sort()).toEqual(["Queue", "Scheduler"]);
  });

  it("groups queue jobs by queue name", () => {
    const r = rollupJobs([job({ owner: "queue", ownerRef: { queue: "docs" } }), job()], { ...opts, groupBy: "queue" });
    expect(r.rows.map(x => x.key)).toEqual(["docs"]);
  });

  it("groups workflow runs by workflow, falling back to the label for records without ownerRef.workflow", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const r = rollupJobs(
      [
        job({ owner: "workflow", ownerRef: { run: "r1", workflow: "weekly-digest" }, label: `weekly-digest run ${uuid}` }),
        job({ owner: "workflow", ownerRef: { run: "r2" }, label: `weekly-digest run ${uuid}` }),
        job({ owner: "workflow", ownerRef: { run: "r3", workflow: "cleanup" }, label: `cleanup run ${uuid}` }),
        job(),
      ],
      { ...opts, groupBy: "workflow" },
    );
    expect(r.rows.map(x => [x.key, x.runs]).sort()).toEqual([
      ["cleanup", 1],
      ["weekly-digest", 2],
    ]);
  });

  it("flags truncation only when the capped list does not reach back to the window start", () => {
    const jobs = [job({ requestedAt: NOW - 2 * DAY }), job()];
    expect(rollupJobs(jobs, { ...opts, groupBy: "owner", days: 7, recordCap: 2 }).truncated).toBe(true);
    expect(rollupJobs(jobs, { ...opts, groupBy: "owner", days: 7, recordCap: 3 }).truncated).toBe(false);
    expect(rollupJobs(jobs, { ...opts, groupBy: "owner", days: 1, recordCap: 2 }).truncated).toBe(false);
  });

  it("tracks the last run", () => {
    const r = rollupJobs([job({ requestedAt: NOW - 5 * H }), job({ requestedAt: NOW - H, status: "failed" })], { ...opts, groupBy: "schedule" });
    expect(r.rows[0]).toMatchObject({ lastRunAt: NOW - H, lastStatus: "failed" });
  });
});
