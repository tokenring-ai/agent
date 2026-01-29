import {TokenRingAgentCommand} from "../types.ts";
import createSubcommandRouter from "../util/subcommandRouter.ts";
import defaultAction from "./hook/default.ts";
import disable from "./hook/disable.ts";
import enable from "./hook/enable.ts";
import get from "./hook/get.ts";
import list from "./hook/list.ts";
import reset from "./hook/reset.ts";
import select from "./hook/select.ts";
import set from "./hook/set.ts";

const description = "/hooks - Manage registered hooks and their execution state";

const execute = createSubcommandRouter({
  get,
  set,
  select,
  list,
  enable,
  disable,
  reset,
  default: defaultAction
});

const help: string = `# /hooks <get|set|select|list|enable|disable|reset>

Manage registered hooks and their execution state. Hooks are special functions that can be triggered during agent lifecycle events.

## Usage

/hooks                        # Show currently enabled hooks (headless) or open selector (interactive)
/hooks list                   # List all registered hooks
/hooks get                    # Show currently enabled hooks
/hooks set <hook1> [hook2...] # Set enabled hooks (replaces current selection)
/hooks select                 # Interactive tree-based hook selection
/hooks enable <hook1> [...]   # Enable one or more hooks
/hooks disable <hook1> [...]  # Disable one or more hooks
/hooks reset                  # Reset hooks to initial configuration

## Examples

/hooks                        # Show enabled hooks or open selector
/hooks list                   # List all registered hooks
/hooks set preProcess onMessage # Enable only these two hooks
/hooks enable postProcess     # Enable the postProcess hook
/hooks disable postProcess    # Disable the postProcess hook
/hooks disable preProcess onMessage # Disable multiple hooks
/hooks reset                  # Reset to initial hook configuration

## Notes

- Hook names are case-sensitive
- set replaces all enabled hooks with the specified list
- enable adds hooks to the current enabled set
- disable removes hooks from the enabled set`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand