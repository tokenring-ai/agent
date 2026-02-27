import agent from "./commands/agent.ts";
import cost from "./commands/cost.ts";
import debug from "./commands/debug.ts";
import help from "./commands/help.ts";
import hooks from "./commands/hooks.ts";
import reset from "./commands/reset.ts";
import settings from "./commands/settings.ts";
import work from "./commands/work.ts";
import type {TokenRingAgentCommand} from "./types.ts";

export default [ reset, hooks, settings, work, debug, help, cost, agent] satisfies TokenRingAgentCommand[];