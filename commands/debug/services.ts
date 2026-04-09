import markdownList from "@tokenring-ai/utility/string/markdownList";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "../../types.ts";

const inputSchema = {
  args: {
    "--limit": {
      type: "number",
      description: "Optional number of log entries to show",
      required: false,
      defaultValue: 50,
      minimum: 1,
      maximum: 1000,
    }
  }
} as const satisfies AgentCommandInputSchema;

function execute({args, agent}: AgentCommandInputType<typeof inputSchema>): string {
  const limit = args["--limit"];
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
  help: "Display service logs from TokenRingApp. Defaults to last 50 entries.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
