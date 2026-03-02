import Agent from "../../Agent.ts";
import {HooksState} from "../../state/hooksState.ts";
import {TokenRingAgentCommand} from "../../types.ts";

export default {
  name: "hooks reset",
  description: "/hooks reset - Reset hooks to initial configuration",
  help: `# /hooks reset

Reset the enabled hooks to the initial configuration defined at startup.

## Usage

/hooks reset

## Example

/hooks reset   # Restores the initial hook configuration`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const hooks = agent.mutateState(HooksState, state => {
      return state.enabledHooks = state.initialConfig.enabledHooks;
    });
    return `Reset hooks to initial selections: ${hooks.join(", ") || "(none)"}`;
  },
} satisfies TokenRingAgentCommand;
