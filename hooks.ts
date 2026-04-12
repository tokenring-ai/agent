import type {RunSubAgentOptions, RunSubAgentResult} from "./services/SubAgentService.ts";

export class AfterSubAgentResponse {
  readonly type = "hook";

  constructor(
    readonly request: RunSubAgentOptions,
    readonly result: RunSubAgentResult,
  ) {
  }
}
