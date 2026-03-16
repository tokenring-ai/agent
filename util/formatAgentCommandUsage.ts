import type {
  AgentCommandArgumentSchema,
  AgentCommandInputSchema,
  TokenRingAgentCommand,
} from "../types.ts";

function formatUsageToken(argumentName: string, argumentSchema: AgentCommandArgumentSchema) {
  if (argumentSchema.type === "flag") {
    return argumentSchema.required ? argumentName : `[${argumentName}]`;
  }

  const valueLabel = argumentSchema.type === "number" ? "<number>" : "<value>";
  return argumentSchema.required
    ? `${argumentName} ${valueLabel}`
    : `[${argumentName} ${valueLabel}]`;
}

export function formatAgentCommandUsage<Schema extends AgentCommandInputSchema>(
  command: TokenRingAgentCommand<Schema>,
) {
  const usageParts = [`/${command.name}`];
  const detailLines: string[] = [];

  for (const [argumentName, argumentSchema] of Object.entries(command.inputSchema.args ?? {})) {
    usageParts.push(formatUsageToken(argumentName, argumentSchema));
    detailLines.push(`- \`${argumentName}\`: ${argumentSchema.description}`);
  }

  if (command.inputSchema.prompt) {
    usageParts.push(command.inputSchema.prompt.required ? "<prompt>" : "[prompt]");
    detailLines.push(`- \`prompt\`: ${command.inputSchema.prompt.description}`);
  }

  const lines = [`Usage: ${usageParts.join(" ")}`];

  if (detailLines.length > 0) {
    lines.push("", "Input:");
    lines.push(...detailLines);
  }

  return lines.join("\n");
}

export function formatAgentCommandUsageError<Schema extends AgentCommandInputSchema>(
  command: TokenRingAgentCommand<Schema>,
  message: string,
) {
  return `${message}\n\n${formatAgentCommandUsage(command)}`;
}
