export function execute(remainder: any, registry: any): Promise<void>;
export function help(): string[];
/**
 * Usage:
 *   /tools [enable|disable|set] <tool1> <tool2> ...
 *   /tools                 - shows interactive tool selection
 *   /tools enable foo bar  - enables foo and bar
 *   /tools disable baz     - disables baz
 *   /tools set a b c       - sets enabled tools to a, b, c
 */
export const description: "/tools [enable|disable|set] <tool1> <tool2> ... - List, enable, disable, or set enabled tools for the chat session.";
