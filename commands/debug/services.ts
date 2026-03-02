import {Agent} from "@tokenring-ai/agent";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import {TokenRingAgentCommand} from "../../types.ts";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const limit = remainder ? parseInt(remainder.trim()) : 50;
  const logs = agent.app.logs.slice(-limit);

  if (logs.length === 0) {
    return "No service logs available.";
  }

  return `***Showing last ${logs.length} log entries***:
${markdownList(logs.map(log =>
  `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()}: ${log.message}`
))}`;
}

export default {
  name: "debug services",
  description: "/debug services - Display service logs",
  execute,
  help: "## /debug services [limit]\n\nDisplay service logs from TokenRingApp. Defaults to last 50 entries.",
} satisfies TokenRingAgentCommand;
