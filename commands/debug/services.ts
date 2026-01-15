import {Agent} from "@tokenring-ai/agent";

export default async function execute(remainder: string, agent: Agent): Promise<void> {
  const limit = remainder ? parseInt(remainder.trim()) : 50;
  const logs = agent.app.logs.slice(-limit);
  
  if (logs.length === 0) {
    agent.infoMessage("No service logs available.");
    return;
  }

  const lines: string[] = [`Showing last ${logs.length} log entries:`];
  for (const log of logs) {
    const date = new Date(log.timestamp).toISOString();
    const level = log.level.toUpperCase();
    lines.push(`[${date}] ${level}: ${log.message}`);
  }
  agent.infoMessage(lines.join("\n"));
}
