import Agent from "../Agent.js";
import {CommandFailedError} from "../AgentError.ts";
import type {InputAttachment} from "../AgentEvents.ts";
import type {
  AgentCommandArgumentSchema,
  AgentCommandInputSchema,
  AgentCommandInputType,
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
    return parsedValue;
  }

  return rawValue;
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
    const argsSchema = inputSchema.args;
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
        if (argumentSchema.required && !(argumentName in parsedArgs)) {
          throw new CommandFailedError(`Missing required argument ${argumentName} for command /${command.name}`);
        }
      }
    }

    const promptValue = tokens.slice(tokenIndex).join(" ").trim();
    if (!inputSchema.prompt && promptValue) {
      throw new CommandFailedError(`Command /${command.name} does not take a prompt.`);
    }

    if (inputSchema.prompt?.required && !promptValue) {
      throw new CommandFailedError(`Command /${command.name} requires a prompt.`);
    }

    const parsedInput = {
      agent,
      ...(inputSchema.allowAttachments ? {attachments} : {}),
      ...(argsSchema ? {args: parsedArgs} : {}),
      ...(inputSchema.prompt ? (promptValue ? {prompt: promptValue} : {}) : {}),
    };

    return parsedInput as AgentCommandInputType<Schema>;
  } catch (error) {
    if (error instanceof CommandFailedError || error instanceof Error) {
      throw new CommandFailedError(formatAgentCommandUsageError(command, error.message));
    }

    throw error;
  }
}
