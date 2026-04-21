import type { AgentCommandArgumentSchema, AgentCommandInputSchema, TokenRingAgentCommand } from "../types.ts";

function formatUsageToken(argumentName: string, argumentSchema: AgentCommandArgumentSchema) {
  if (argumentSchema.type === "flag") {
    return argumentSchema.required ? argumentName : `[${argumentName}]`;
  }

  const valueLabel = argumentSchema.type === "number" ? "<number>" : "<value>";
  return argumentSchema.required ? `${argumentName} ${valueLabel}` : `[${argumentName} ${valueLabel}]`;
}

export function formatAgentCommandUsage<Schema extends AgentCommandInputSchema>(command: TokenRingAgentCommand<Schema>) {
  const usageParts = [`/${command.name}`];
  const detailLines: string[] = [];

  for (const [argumentName, argumentSchema] of Object.entries(command.inputSchema.args ?? {})) {
    usageParts.push(formatUsageToken(argumentName, argumentSchema));
    detailLines.push(`- \`${argumentName}\`: ${argumentSchema.description}`);
  }

  for (const positional of command.inputSchema.positionals ?? []) {
    usageParts.push(positional.required ? `<${positional.name}>` : `[${positional.name}]`);
    detailLines.push(`- \`${positional.name}\`: ${positional.description}`);
  }

  const remainder = command.inputSchema.remainder;
  if (remainder) {
    usageParts.push(remainder.required ? `<${remainder.name}...>` : `[${remainder.name}...]`);
    detailLines.push(`- \`${remainder.name}\`: ${remainder.description}`);
  }

  const lines = [`Usage: ${usageParts.join(" ")}`];

  if (detailLines.length > 0) {
    lines.push("", "Input:");
    lines.push(...detailLines);
  }

  return lines.join("\n");
}

export function formatAgentCommandUsageError<Schema extends AgentCommandInputSchema>(command: TokenRingAgentCommand<Schema>, message: string) {
  return `${message}\n\n${formatAgentCommandUsage(command)}`;
}
