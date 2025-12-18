import {TokenRingAgentCommand} from "../types.ts";
import createSubcommandRouter from "../util/subcommandRouter.ts";
import logging from "./debug/logging.ts";
import markdown from "./debug/markdown.ts";
import services from "./debug/services.ts";

const description = "/debug - Debug utilities and diagnostics" as const;

const execute = createSubcommandRouter({
  logging,
  markdown,
  services,
});

const help = `# /debug

## Description
Debug utilities and diagnostics for TokenRing agents.

## Subcommands

### /debug logging on|off
Enable or disable debug logging output.

Examples:
- /debug logging on
- /debug logging off

### /debug markdown
Output a markdown sample to test console rendering.

Example:
- /debug markdown

### /debug services [limit]
Display service logs from TokenRingApp.

Examples:
- /debug services       # Shows last 50 logs
- /debug services 100   # Shows last 100 logs

## Notes
- Service logs include both info and error level messages
- Logs are stored in memory and cleared on restart`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;
