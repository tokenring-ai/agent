import type { RunSubAgentOptions, RunSubAgentResult } from "./util/runSubAgent.ts";

export class AfterSubAgentResponse {
  readonly type = "hook";

  constructor(
    readonly request: RunSubAgentOptions,
    readonly result: RunSubAgentResult,
  ) {}
}
