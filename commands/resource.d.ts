export function execute(remainder: any, registry: any): Promise<void>;
export function help(): string[];
/**
 * Usage:
 *   /resources [enable|disable|set] <resource1> <resource2> ...
 *   /resources                 - shows interactive resource selection
 *   /resources enable foo bar  - enables foo and bar
 *   /resources disable baz     - disables baz
 *   /resources set a b c       - sets enabled resources to a, b, c
 */
export const description: "/resources [enable|disable|set] <resource1> <resource2> ... - List, enable, disable, or set enabled resources for the chat session.";
