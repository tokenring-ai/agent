import Agent from "../../Agent.ts";
import {HooksState} from "../../state/hooksState.ts";
import {TokenRingAgentCommand} from "../../types.ts";

export default {
  name: "hooks get",
  description: "/hooks get - Show currently enabled hooks",
  help: `# /hooks get

Show the currently enabled hooks.

## Usage

/hooks get

## Example

/hooks get    # Prints the list of currently enabled hooks`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const hooks = agent.getState(HooksState).enabledHooks;
    return `Currently enabled hooks: ${hooks.join(", ") || "(none)"}`;
  },
} satisfies TokenRingAgentCommand;
