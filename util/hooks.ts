import type Agent from "../Agent.ts";
import type {InputReceived} from "../AgentEvents.ts";
import type {Hook} from "../types.ts";

export class AfterAgentInputSuccess {
  readonly type = "hook";
  constructor(readonly input: InputReceived) {}
}

export class AfterAgentInputError {
  readonly type = "hook";
  constructor(readonly input: InputReceived, readonly status: string, readonly error: Error) {}
}

export class AfterAgentInputHandled {
  readonly type = "hook";
  constructor(readonly input: InputReceived) {}
}


export class HookCallback<T extends Hook> {
  constructor(
    readonly hookConstructor: abstract new (...args: any[]) => T,
    readonly callback: (data: T, agent: Agent) => Promise<void> | void
  ) {}
}