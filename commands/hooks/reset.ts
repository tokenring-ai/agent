import Agent from "../../Agent.ts";
import {HooksState} from "../../state/hooksState.ts";

export default async function reset(_remainder: string, agent: Agent): Promise<string> {
  const hooks = agent.mutateState(HooksState, state => {
    return state.enabledHooks = state.initialConfig.enabledHooks;
  });

  return `Reset hooks to initial selections: ${hooks.join(", ") || "(none)"}`;
}
