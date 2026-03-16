import markdownList from "@tokenring-ai/utility/string/markdownList";
import {
  AgentCommandInputSchema,
  AgentCommandInputType,
  TokenRingAgentCommand,
} from "../../types.ts";

const inputSchema = {
  prompt: {
    description: "Optional number of log entries to show",
    required: false,
  },
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({prompt, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const limit = prompt ? parseInt(prompt.trim()) : 50;
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
  description: "Display service logs",
  inputSchema,
  execute,
  help: "## /debug services [limit]\n\nDisplay service logs from TokenRingApp. Defaults to last 50 entries.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
