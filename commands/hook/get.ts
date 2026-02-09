import Agent from "../../Agent.ts";
import {HooksState} from "../../state/hooksState.ts";

export default async function get(remainder: string, agent: Agent): Promise<void> {
  const hooks = agent.getState(HooksState).enabledHooks;
  agent.infoMessage(`Currently enabled hooks: ${hooks.join(", ") || "(none)"}`);
}
