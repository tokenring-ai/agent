import Agent from "../../Agent.ts";
import {HooksState} from "../../state/hooksState.ts";

export default async function reset(_remainder: string, agent: Agent): Promise<void> {
  const hooks = agent.mutateState(HooksState, state => {
    return state.enabledHooks = state.initialConfig.enabledHooks;
  });

  agent.infoMessage(`Reset hooks to initial selections: ${hooks.join(", ") || "(none)"}`);
}
