import type { InputMessage } from "./AgentEvents.js";

export class AfterInputReceived {
  readonly type = "hook";

  constructor(readonly input: InputMessage) {}
}
