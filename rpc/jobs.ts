import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import AgentJobService, { type JobListFilter, MAX_JOB_RECORDS } from "../services/AgentJobService.ts";
import { rollupJobs } from "../util/jobRollup.ts";
import AgentJobsRpcSchema from "./jobs.schema.ts";

export default createRPCEndpoint(AgentJobsRpcSchema, {
  listJobs(args, app) {
    return { jobs: app.requireService(AgentJobService).list(args) };
  },

  streamJobs: createPollingQueryStream({
    name: "AgentJobs.streamJobs",
    intervalMs: 1000,
    poll: (args: JobListFilter, app) => ({
      jobs: app.requireService(AgentJobService).list(args),
    }),
  }),

  getJobPolicy(_args, app) {
    return app.requireService(AgentJobService).getJobPolicy();
  },

  getJobRollup(args, app) {
    const service = app.requireService(AgentJobService);
    const all = service.list();
    const jobs = args.owner === undefined ? all : all.filter(job => job.owner === args.owner);
    return rollupJobs(jobs, { groupBy: args.groupBy, days: args.days, now: Date.now(), recordCap: MAX_JOB_RECORDS, allRecords: all });
  },

  cancelJob(args, app) {
    const cancelled = app.requireService(AgentJobService).cancel(args.jobId, args.reason ?? "Cancelled by a person");
    return { status: "success" as const, cancelled };
  },
});
