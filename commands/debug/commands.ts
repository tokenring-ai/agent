import AgentCommandService from "../../services/AgentCommandService.ts";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "../../types.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export function formatCommandUsage<Schema extends AgentCommandInputSchema>(command: TokenRingAgentCommand<Schema>) {
  const usageParts = [`/${command.name}`];
  const detailLines: string[] = [];

  for (const positional of command.inputSchema.positionals ?? []) {
    const name = positional.name;
    usageParts.push(positional.required ? `<${name}>` : `[${name}]`);
    detailLines.push(`- ${name}: ${positional.description}${positional.required ? " (required)" : " (optional)"}`);
  }

  for (const [argumentName, argumentSchema] of Object.entries(command.inputSchema.args ?? {})) {
    const isRequired = argumentSchema.required;
    const argumentExample =
      argumentSchema.type === "string" ? `${argumentName} string` : argumentSchema.type === "number" ? `${argumentName} 12345` : argumentName;

    usageParts.push(isRequired ? `<${argumentExample}>` : `[${argumentExample}]`);
    detailLines.push(`- ${argumentName}: ${argumentSchema.description}${isRequired ? " (required)" : " (optional)"}`);
  }

  const lines = [`# ${usageParts.join(" ")}`, command.description];

  if (detailLines.length > 0) {
    lines.push("", "### Arguments", ...detailLines);
  }

  lines.push("\n## Help", command.help);

  return lines.join("\n");
}

function execute({ agent }: AgentCommandInputType<typeof inputSchema>): string {
  const commandService = agent.requireServiceByType(AgentCommandService);

  const commandList = commandService
    .getCommandEntries()
    .map(([, command]) => formatCommandUsage(command))
    .join("\n\n---\n\n");

  return `# Registered Commands\n\n---\n\n${commandList}\n\n---\n\n`;
}

export default {
  name: "debug commands",
  description: "Dumps a list of all the registered commands into the chat",
  inputSchema,
  execute,
  help: "Outputs a list of all the registered commands into the chat, for debugging purposes",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
