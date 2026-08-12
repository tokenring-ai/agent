import type { InputMessage } from "./AgentEvents.js";

export class BeforeInputReceived {
  readonly type = "hook";

  constructor(readonly input: InputMessage) {}
}
