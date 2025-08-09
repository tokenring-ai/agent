/**
 * Executes a chat command and yields output as an async generator
 * @param {string} commandName
 * @param {string} remainder
 * @param {TokenRingRegistry} registry - The package registry
 * @returns {AsyncGenerator<string>}
 */
export function runCommand(commandName: string, remainder: string, registry: TokenRingRegistry): AsyncGenerator<string>;
