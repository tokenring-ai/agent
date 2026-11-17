import type TokenRingApp from "@tokenring-ai/app";
import type Agent from "../Agent.ts";
import { AgentManager } from "../index.ts";
import type { AgentStateSlice } from "../types.ts";

export type AgentStateStreamYield<Projection> = { status: "agentNotFound" } | { status: "success"; data: Projection; revision: number };

export type StateSubscribable<Slice> = {
  subscribeStateAsync<T extends Slice>(ClassType: new (...args: any[]) => T, signal: AbortSignal): AsyncGenerator<T, void, unknown>;
};

export type CreateAgentStateSliceStreamOptions<Slice, Projection> = {
  SliceClass: new (...args: any[]) => Slice;
  project: (state: Slice, agent: Agent) => Projection;
  equals?: (a: Projection, b: Projection) => boolean;
};

export function createAgentStateSliceStream<Slice extends AgentStateSlice<any>, Result>(
  opts: CreateAgentStateSliceStreamOptions<Slice, Result>,
): (args: { agentId: string }, app: TokenRingApp, signal: AbortSignal) => AsyncGenerator<Result | { status: "agentNotFound" }> {
  return async function* (args, app, signal) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      yield { status: "agentNotFound" };
      return;
    }

    let last: Result | undefined;

    // End when the agent is deleted as well as when the client goes away, so a viewing client learns
    // the agent is gone instead of watching a dead agent's state forever.
    const controller = new AbortController();
    const onClientAbort = () => controller.abort(signal.reason);
    const onAgentShutdown = () => controller.abort();
    if (signal.aborted) onClientAbort();
    else signal.addEventListener("abort", onClientAbort);
    agent.agentShutdownSignal.addEventListener("abort", onAgentShutdown);
    if (agent.agentShutdownSignal.aborted) onAgentShutdown();

    try {
      for await (const slice of agent.subscribeStateAsync(opts.SliceClass, controller.signal)) {
        const data = opts.project(slice, agent);
        if (last !== undefined && opts.equals?.(last, data)) {
          continue;
        }
        last = data;
        yield data;
      }
      if (agent.agentShutdownSignal.aborted && !signal.aborted) yield { status: "agentNotFound" };
    } finally {
      signal.removeEventListener("abort", onClientAbort);
      agent.agentShutdownSignal.removeEventListener("abort", onAgentShutdown);
    }
  };
}
