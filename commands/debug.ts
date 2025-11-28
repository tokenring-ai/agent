import convertBoolean from "@tokenring-ai/utility/string/convertBoolean";
import Agent from "../Agent.ts";
import {TokenRingAgentCommand} from "../types.ts";

const description = "/debug - Toggle debug logging." as const;


export function execute(remainder: string | undefined, agent: Agent): void {
  const arg = remainder?.trim().toLowerCase();

  if (!arg) {
    agent.infoLine(`Debug logging is currently ${agent.debugEnabled ? "enabled" : "disabled"}`);
    return;
  }

  agent.debugEnabled = convertBoolean(arg);
}

const help: string = `# /debug

## Description
Toggle debug logging for the agent. When enabled, detailed debug information will be logged to help troubleshoot issues.

## Commands
- **(no argument)** - Shows current debug logging status
- **on** - Enables debug logging
- **off** - Disables debug logging

## Usage examples
/debug          # Shows current status
/debug on       # Enables debug logging
/debug off      # Disables debug logging

## Debug information includes
- Agent lifecycle events
- Service initialization and shutdown
- Command execution details
- State changes and transitions
- Network requests and responses
- Error details and stack traces

## Notes
- Debug logging can impact performance due to increased I/O
- Enable only when needed for troubleshooting
- Debug output is typically written to console or log files
- Some sensitive information may be logged in debug mode`;

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand