import type Agent from "../Agent.ts";
import { CommandFailedError } from "../AgentError.ts";
import type { BaseAttachment } from "../AgentEvents.ts";
import type { AgentCommandArgumentSchema, AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "../types.ts";
import { formatAgentCommandUsageError } from "./formatAgentCommandUsage.ts";

interface Token {
  value: string;
  /** Offset in the input just after the token. */
  end: number;
}

/**
 * Reads the token starting at or after `start`, shell-style: quotes group words, and outside quotes a
 * backslash escapes the next character. Inside double quotes a backslash only escapes `"` and `\`, and
 * inside single quotes nothing is special, so paths and regexes in quotes come through as typed.
 */
function readToken(input: string, start: number): Token | null {
  let index = start;
  while (index < input.length && /\s/.test(input[index]!)) index++;
  if (index >= input.length) return null;

  let current = "";
  let quote: '"' | "'" | null = null;
  for (; index < input.length; index++) {
    const char = input[index]!;
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      const next = input[index + 1];
      if (char === "\\" && (next === '"' || next === "\\")) {
        current += next;
        index++;
      } else if (char === '"') {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\\") {
      const next = input[index + 1];
      current += next ?? "\\";
      if (next !== undefined) index++;
      continue;
    }
    if ((char === '"' || char === "'") && (current === "" || current.endsWith("="))) {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) break;
    current += char;
  }
  if (quote) throw new Error("Unterminated quote in command input");
  return { value: current, end: index };
}

/** The free text after the parsed arguments, exactly as typed — a chat message must reach the model unaltered. */
function rawRemainder(input: string, start: number): string {
  const raw = input.slice(start).trim();
  // A remainder that is exactly one quoted string is taken without its quotes, as it always was.
  // Only exactly: `"Hello"!` or `"a" "b"` are text that happens to contain quotes, and stay as typed.
  if (raw.length >= 2 && (raw[0] === '"' || raw[0] === "'") && closingQuoteIndex(raw) === raw.length - 1) {
    try {
      const token = readToken(raw, 0);
      if (token && token.end === raw.length) return token.value;
    } catch {
      // An unbalanced quote in free text is just text.
    }
  }
  return raw;
}

/** Where the quote opening `text` closes: a double quote skips backslash escapes, a single quote does not. */
function closingQuoteIndex(text: string): number {
  const quote = text[0];
  for (let i = 1; i < text.length; i++) {
    if (quote === '"' && text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === quote) return i;
  }
  return -1;
}

function parseDateValue(argumentName: string, rawValue: string): number {
  const parsedDate = Date.parse(rawValue);

  if (Number.isNaN(parsedDate)) {
    throw new CommandFailedError(`Argument ${argumentName} must be a valid date (e.g. "2024-01-15", "2024-01-15T09:30", or "January 15, 2024").`);
  }

  return parsedDate;
}

function parseArgumentValue(argumentName: string, argumentSchema: AgentCommandArgumentSchema, rawValue: string | undefined): string | number | boolean {
  if (argumentSchema.type === "flag") {
    if (rawValue === undefined || rawValue === "") {
      return true;
    }

    const normalizedValue = rawValue.toLowerCase();
    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }

    throw new CommandFailedError(`Argument ${argumentName} must be true or false.`);
  }

  if (rawValue === undefined) {
    throw new CommandFailedError(`Argument ${argumentName} requires a value.`);
  }

  if (argumentSchema.type === "number") {
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) {
      throw new CommandFailedError(`Argument ${argumentName} must be a valid number.`);
    }
    return validateNumberRange(argumentName, parsedValue, argumentSchema.minimum, argumentSchema.maximum);
  }

  if (argumentSchema.type === "date") {
    return parseDateValue(argumentName, rawValue);
  }
  if (argumentSchema.type === "enum") {
    if (!argumentSchema.values.includes(rawValue)) {
      throw new CommandFailedError(`Argument ${argumentName} must be one of: ${argumentSchema.values.join(", ")}`);
    }
    return rawValue;
  }

  return validateStringRange(argumentName, rawValue, argumentSchema.minimum, argumentSchema.maximum);
}

function validateStringRange(name: string, value: string, minimum?: number, maximum?: number): string {
  if (minimum !== undefined && value.length < minimum) {
    throw new CommandFailedError(`${name} must be at least ${minimum} characters.`);
  }

  if (maximum !== undefined && value.length > maximum) {
    throw new CommandFailedError(`${name} must be at most ${maximum} characters.`);
  }

  return value;
}

function validateNumberRange(name: string, value: number, minimum?: number, maximum?: number): number {
  if (minimum !== undefined && value < minimum) {
    throw new CommandFailedError(`${name} must be at least ${minimum}.`);
  }

  if (maximum !== undefined && value > maximum) {
    throw new CommandFailedError(`${name} must be at most ${maximum}.`);
  }

  return value;
}

function findMatchingArgument(
  token: string,
  argsSchema: NonNullable<AgentCommandInputSchema["args"]>,
): { name: string; value?: string | undefined } | undefined {
  const strippedToken = token.startsWith("--") ? token.slice(2) : null;
  if (strippedToken === null) return undefined;

  for (const argumentName of Object.keys(argsSchema)) {
    if (strippedToken === argumentName) {
      return { name: argumentName };
    }

    const prefix = `${argumentName}=`;
    if (strippedToken.startsWith(prefix)) {
      return {
        name: argumentName,
        value: strippedToken.slice(prefix.length),
      };
    }
  }

  return undefined;
}

export function parseAgentCommandInput<Schema extends AgentCommandInputSchema>(
  command: TokenRingAgentCommand<Schema>,
  input: string,
  attachments: BaseAttachment[],
  agent: Agent,
): AgentCommandInputType<Schema> {
  try {
    const { inputSchema } = command;

    if (!inputSchema.allowAttachments && attachments.length > 0) {
      throw new CommandFailedError(`Attachments are not allowed for command: /${command.name}`);
    }

    const text = input.trim();
    let position = 0;
    const parsedArgs: Record<string, string | number | boolean> = {};
    const argsSchema = inputSchema.args;
    const positionalSchema = inputSchema.positionals;
    const remainderSchema = inputSchema.remainder;

    // A command that declares no options (like /chat send) takes its text as it is, even text
    // that starts with "-".
    if (argsSchema && Object.keys(argsSchema).length > 0) {
      for (;;) {
        const token = readToken(text, position);
        if (!token) break;

        if (token.value === "--") {
          position = token.end;
          break;
        }

        const matchingArgument = findMatchingArgument(token.value, argsSchema);
        if (!matchingArgument) {
          if (token.value.startsWith("-")) {
            throw new CommandFailedError(`Unknown argument ${token.value} for command /${command.name}`);
          }
          break;
        }
        position = token.end;

        if (matchingArgument.name in parsedArgs) {
          throw new CommandFailedError(`Argument ${matchingArgument.name} was provided more than once.`);
        }

        const argumentSchema = argsSchema[matchingArgument.name]!;
        let rawValue = matchingArgument.value;

        if (argumentSchema.type !== "flag" && rawValue === undefined) {
          const valueToken = readToken(text, position);
          if (valueToken && findMatchingArgument(valueToken.value, argsSchema)) {
            throw new CommandFailedError(`Argument ${matchingArgument.name} requires a value, but was followed by ${valueToken.value}.`);
          }
          if (valueToken) {
            rawValue = valueToken.value;
            position = valueToken.end;
          }
        }

        parsedArgs[matchingArgument.name] = parseArgumentValue(matchingArgument.name, argumentSchema, rawValue);
      }

      for (const [argumentName, argumentSchema] of Object.entries(argsSchema)) {
        if (argumentName in parsedArgs) {
          continue;
        }

        if (argumentSchema.type === "number" && argumentSchema.defaultValue !== undefined) {
          parsedArgs[argumentName] = validateNumberRange(argumentName, argumentSchema.defaultValue, argumentSchema.minimum, argumentSchema.maximum);
          continue;
        }

        if (argumentSchema.type === "string" && argumentSchema.defaultValue !== undefined) {
          parsedArgs[argumentName] = validateStringRange(argumentName, argumentSchema.defaultValue, argumentSchema.minimum, argumentSchema.maximum);
          continue;
        }

        if ((argumentSchema.type === "date" || argumentSchema.type === "enum") && argumentSchema.defaultValue !== undefined) {
          parsedArgs[argumentName] = argumentSchema.defaultValue;
          continue;
        }

        if (argumentSchema.required) {
          throw new CommandFailedError(`Missing required argument ${argumentName} for command /${command.name}`);
        }
      }
    }

    if (positionalSchema) {
      for (const positional of positionalSchema) {
        const token = readToken(text, position);

        if (token) {
          parsedArgs[positional.name] = token.value;
          position = token.end;
          continue;
        }

        if (positional.defaultValue !== undefined) {
          parsedArgs[positional.name] = positional.defaultValue;
          continue;
        }

        if (positional.required) {
          throw new CommandFailedError(`Missing required positional ${positional.name} for command /${command.name}`);
        }
      }

      if (!remainderSchema && readToken(text, position)) {
        throw new CommandFailedError(`Too many positional arguments for command /${command.name}`);
      }
    } else if (!remainderSchema && readToken(text, position)) {
      const extra = readToken(text, position)!.value;
      throw new CommandFailedError(
        extra.startsWith("-") ? `Unknown argument ${extra} for command /${command.name}` : `Command /${command.name} does not take positional arguments.`,
      );
    }

    let parsedRemainder: string | undefined;

    if (remainderSchema) {
      const value = rawRemainder(text, position);

      if (value) {
        parsedRemainder = value;
      } else if ("defaultValue" in remainderSchema) {
        parsedRemainder = remainderSchema.defaultValue;
      } else if (remainderSchema.required) {
        throw new CommandFailedError(`Missing required remainder ${remainderSchema.name} for command /${command.name}`);
      }
    }

    const parsedInput = {
      agent,
      ...(inputSchema.allowAttachments ? { attachments } : {}),
      ...(argsSchema || positionalSchema ? { args: parsedArgs } : {}),
      ...(remainderSchema ? { remainder: parsedRemainder } : {}),
    };

    return parsedInput as AgentCommandInputType<Schema>;
  } catch (error: unknown) {
    if (Error.isError(error)) {
      throw new CommandFailedError(formatAgentCommandUsageError(command, error.message));
    }

    throw error;
  }
}
