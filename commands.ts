import agentList from "./commands/agent/list.ts";
import agentRun from "./commands/agent/run.ts";
import agentShutdown from "./commands/agent/shutdown.ts";
import agentTypes from "./commands/agent/types.ts";
import debugAppShutdown from "./commands/debug/app.ts";
import debugChat from "./commands/debug/chat.ts";
import debugCheckpoint from "./commands/debug/checkpoint.ts";
import debugCommands from "./commands/debug/commands.ts";
import debugLogging from "./commands/debug/logging.ts";
import debugMarkdown from "./commands/debug/markdown.ts";
import debugQuestions from "./commands/debug/questions.ts";
import debugServices from "./commands/debug/services.ts";
import help from "./commands/help.ts";
import settings from "./commands/settings.ts";
import type { TokenRingAgentCommand } from "./types.ts";

export default [
  settings,
  help,
  agentTypes,
  agentList,
  agentRun,
  agentShutdown,
  debugAppShutdown,
  debugChat,
  debugLogging,
  debugMarkdown,
  debugQuestions,
  debugServices,
  debugCheckpoint,
  debugCommands,
] satisfies TokenRingAgentCommand<any>[];
