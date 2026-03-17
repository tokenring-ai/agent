import Agent from "../Agent.js";
import {CommandFailedError} from "../AgentError.ts";
import type {InputAttachment} from "../AgentEvents.ts";
import type {
  AgentCommandArgumentSchema,
  AgentCommandInputSchema,
  AgentCommandInputType,
  AgentCommandPositionalSchema,
  TokenRingAgentCommand,
} from "../types.ts";
import {formatAgentCommandUsageError} from "./formatAgentCommandUsage.ts";

function tokenizeInput(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let tokenStarted = false;
  let quote: '"' | "'" | null = null;
  let escapeNext = false;

  for (const char of input) {
    if (escapeNext) {
      current += char;
      tokenStarted = true;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escapeNext) {
    current += "\\";
  }

  if (quote) {
    throw new Error("Unterminated quote in command input");
  }

  if (tokenStarted) {
    tokens.push(current);
  }

  return tokens;
}

function parseArgumentValue(
  argumentName: string,
  argumentSchema: AgentCommandArgumentSchema,
  rawValue: string | undefined,
): string | number | boolean {
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

  return validateStringRange(argumentName, rawValue, argumentSchema.minimum, argumentSchema.maximum);
}

function parsePositionalValue(
  positionalSchema: AgentCommandPositionalSchema,
  rawValue: string,
): string {
  return validateStringRange(
    positionalSchema.name,
    rawValue,
    positionalSchema.minimum,
    positionalSchema.maximum,
  );
}

function validateStringRange(
  name: string,
  value: string,
  minimum?: number,
  maximum?: number,
): string {
  if (minimum !== undefined && value.length < minimum) {
    throw new CommandFailedError(`${name} must be at least ${minimum} characters.`);
  }

  if (maximum !== undefined && value.length > maximum) {
    throw new CommandFailedError(`${name} must be at most ${maximum} characters.`);
  }

  return value;
}

function validateNumberRange(
  name: string,
  value: number,
  minimum?: number,
  maximum?: number,
): number {
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
): { name: string; value?: string } | undefined {
  for (const argumentName of Object.keys(argsSchema)) {
    if (token === argumentName) {
      return {name: argumentName};
    }

    const prefix = `${argumentName}=`;
    if (token.startsWith(prefix)) {
      return {
        name: argumentName,
        value: token.slice(prefix.length),
      };
    }
  }

  return undefined;
}

export function parseAgentCommandInput<Schema extends AgentCommandInputSchema>(
  command: TokenRingAgentCommand<Schema>,
  input: string,
  attachments: InputAttachment[],
  agent: Agent,
): AgentCommandInputType<Schema> {
  try {
    const {inputSchema} = command;

    if (!inputSchema.allowAttachments && attachments.length > 0) {
      throw new CommandFailedError(`Attachments are not allowed for command: /${command.name}`);
    }

    const tokens = tokenizeInput(input.trim());
    const parsedArgs: Record<string, string | number | boolean> = {};
    const parsedPositionals: Record<string, string> = {};
    const argsSchema = inputSchema.args;
    const positionalSchema = inputSchema.positionals;
    let tokenIndex = 0;

    if (argsSchema) {
      while (tokenIndex < tokens.length) {
        const token = tokens[tokenIndex];

        if (token === "--") {
          tokenIndex += 1;
          break;
        }

        const matchingArgument = findMatchingArgument(token, argsSchema);
        if (!matchingArgument) {
          if (token.startsWith("-")) {
            throw new CommandFailedError(`Unknown argument ${token} for command /${command.name}`);
          }
          break;
        }

        if (matchingArgument.name in parsedArgs) {
          throw new CommandFailedError(`Argument ${matchingArgument.name} was provided more than once.`);
        }

        const argumentSchema = argsSchema[matchingArgument.name];
        let rawValue = matchingArgument.value;

        if (argumentSchema.type !== "flag" && rawValue === undefined) {
          tokenIndex += 1;
          rawValue = tokens[tokenIndex];
        }

        parsedArgs[matchingArgument.name] = parseArgumentValue(
          matchingArgument.name,
          argumentSchema,
          rawValue,
        );
        tokenIndex += 1;
      }

      for (const [argumentName, argumentSchema] of Object.entries(argsSchema)) {
        if (argumentName in parsedArgs) {
          continue;
        }

        if (argumentSchema.type === "number" && argumentSchema.defaultValue !== undefined) {
          parsedArgs[argumentName] =
            validateNumberRange(
              argumentName,
              argumentSchema.defaultValue,
              argumentSchema.minimum,
              argumentSchema.maximum,
            );
          continue;
        }

        if (argumentSchema.type === "string" && argumentSchema.defaultValue !== undefined) {
          parsedArgs[argumentName] =
            validateStringRange(
              argumentName,
              argumentSchema.defaultValue,
              argumentSchema.minimum,
              argumentSchema.maximum,
            );
          continue;
        }

        if (argumentSchema.required) {
          throw new CommandFailedError(`Missing required argument ${argumentName} for command /${command.name}`);
        }
      }
    }

    const remainingTokens = tokens.slice(tokenIndex);

    if (positionalSchema) {
      let positionalTokenIndex = 0;

      for (let index = 0; index < positionalSchema.length; index += 1) {
        const positional = positionalSchema[index];

        if (positional.greedy) {
          if (index !== positionalSchema.length - 1) {
            throw new CommandFailedError(`Greedy positional ${positional.name} must be the final positional for command /${command.name}`);
          }

          const value = remainingTokens.slice(positionalTokenIndex).join(" ").trim();

          if (value) {
            parsedPositionals[positional.name] = parsePositionalValue(positional, value);
          } else if (positional.defaultValue !== undefined) {
            parsedPositionals[positional.name] = parsePositionalValue(positional, positional.defaultValue);
          } else if (positional.required) {
            throw new CommandFailedError(`Missing required positional ${positional.name} for command /${command.name}`);
          }

          positionalTokenIndex = remainingTokens.length;
          continue;
        }

        const value = remainingTokens[positionalTokenIndex];

        if (value !== undefined) {
          parsedPositionals[positional.name] = parsePositionalValue(positional, value);
          positionalTokenIndex += 1;
          continue;
        }

        if (positional.defaultValue !== undefined) {
          parsedPositionals[positional.name] = parsePositionalValue(positional, positional.defaultValue);
          continue;
        }

        if (positional.required) {
          throw new CommandFailedError(`Missing required positional ${positional.name} for command /${command.name}`);
        }
      }

      if (positionalTokenIndex < remainingTokens.length) {
        throw new CommandFailedError(`Too many positional arguments for command /${command.name}`);
      }
    } else if (remainingTokens.length > 0) {
      throw new CommandFailedError(`Command /${command.name} does not take positional arguments.`);
    }

    const parsedInput = {
      agent,
      ...(inputSchema.allowAttachments ? {attachments} : {}),
      ...(argsSchema ? {args: parsedArgs} : {}),
      ...(positionalSchema ? {positionals: parsedPositionals} : {}),
    };

    return parsedInput as AgentCommandInputType<Schema>;
  } catch (error) {
    if (error instanceof CommandFailedError || error instanceof Error) {
      throw new CommandFailedError(formatAgentCommandUsageError(command, error.message));
    }

    throw error;
  }
}
