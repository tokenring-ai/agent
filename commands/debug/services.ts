import {Agent} from "@tokenring-ai/agent";
import markdownList from "@tokenring-ai/utility/string/markdownList";

export default async function execute(remainder: string, agent: Agent): Promise<string> {
  const limit = remainder ? parseInt(remainder.trim()) : 50;
  const logs = agent.app.logs.slice(-limit);
  
  if (logs.length === 0) {
    return "No service logs available.";
  }

  return `
***Showing last ${logs.length} log entries***:
${
    markdownList(logs.map(log => 
      `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()}: ${log.message}`
    ))
}`;
}
