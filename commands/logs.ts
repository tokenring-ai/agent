import Agent from "../Agent.ts";
import {TokenRingAgentCommand} from "../types.ts";

const description = "/logs - Display service logs." as const;

export function execute(remainder: string | undefined, agent: Agent): void {
  const limit = remainder ? parseInt(remainder.trim()) : 50;
  const logs = agent.app.logs.slice(-limit);
  
  if (logs.length === 0) {
    agent.infoLine("No service logs available.");
    return;
  }

  agent.infoLine(`Showing last ${logs.length} log entries:`);
  for (const log of logs) {
    const date = new Date(log.timestamp).toISOString();
    const level = log.level.toUpperCase();
    agent.systemMessage(`[${date}] ${level}: ${log.message}`, log.level === "error" ? "error" : "info");
  }
}

const help: string = `# /logs

## Description
Display service logs from TokenRingApp. Shows system-level messages logged by services.

## Commands
- **(no argument)** - Shows last 50 log entries
- **[number]** - Shows last N log entries

## Usage examples
/logs           # Shows last 50 logs
/logs 100       # Shows last 100 logs
/logs 10        # Shows last 10 logs

## Notes
- Logs include both info and error level messages
- Each entry shows timestamp, level, and message
- Logs are stored in memory and cleared on restart`;

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand;
