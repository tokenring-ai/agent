import {Agent} from "@tokenring-ai/agent";

export default async function execute(remainder: string, agent: Agent): Promise<void> {
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
