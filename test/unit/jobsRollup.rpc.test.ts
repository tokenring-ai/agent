import { describe, expect, it } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import jobsRpc from "../../rpc/jobs.ts";
import { type JobRecord, JobRecordSchema } from "../../schema.ts";
import AgentJobService from "../../services/AgentJobService.ts";

function record(id: string, owner: string, ownerRef: Record<string, string>, costUsd: number | null): JobRecord {
  const now = Date.now();
  return JobRecordSchema.parse({
    id,
    owner,
    label: id,
    ownerRef,
    agentType: "code",
    origin: { kind: "schedule", scheduleId: "nightly" },
    parentJobId: null,
    rootJobId: id,
    depth: 1,
    status: "failed",
    requestedAt: now - 1000,
    startedAt: now - 1000,
    endedAt: now,
    summary: "",
    error: null,
    costUsd,
    tokens: null,
    agentId: null,
  });
}

function call(args: Record<string, unknown>, app: TokenRingApp) {
  const methods = jobsRpc.methods as unknown as Record<string, { execute: (args: unknown, app: TokenRingApp) => unknown }>;
  return methods.getJobRollup!.execute(args, app) as ReturnType<typeof Object>;
}

describe("getJobRollup RPC", () => {
  it("rolls up the engine's records, filtered by owner", () => {
    const app = createTestingApp();
    const records = [
      record("a", "scheduler", { schedule: "nightly" }, 1),
      record("b", "scheduler", { schedule: "nightly" }, null),
      record("c", "queue", { queue: "q" }, 2),
    ];
    app.addService(AgentJobService, { list: () => records } as unknown as AgentJobService);
    const all = call({ groupBy: "owner" }, app) as {
      rows: unknown[];
      totals: { runs: number; totalCostUsd: number; costUnavailableJobs: number };
      days: number;
      truncated: boolean;
    };
    expect(all.rows).toHaveLength(2);
    expect(all.days).toBe(7);
    expect(all.truncated).toBe(false);
    expect(all.totals).toMatchObject({ runs: 3, totalCostUsd: 3, costUnavailableJobs: 1 });
    const sched = call({ groupBy: "schedule", owner: "scheduler" }, app) as { rows: { key: string; runs: number }[] };
    expect(sched.rows).toMatchObject([{ key: "nightly", runs: 2 }]);
  });
});
