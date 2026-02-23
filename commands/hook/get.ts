import Agent from "../../Agent.ts";
import {HooksState} from "../../state/hooksState.ts";

export default async function get(remainder: string, agent: Agent): Promise<string> {
  const hooks = agent.getState(HooksState).enabledHooks;
  return `Currently enabled hooks: ${hooks.join(", ") || "(none)"}`;
}
