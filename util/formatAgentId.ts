/**
 * Format agent ID consistently (8 characters)
 */
export function formatAgentId(id: string): string {
  return id.slice(0, 8);
}
