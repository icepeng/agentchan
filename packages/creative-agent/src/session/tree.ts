/**
 * Generate a title from the first user message text.
 */
export function generateTitle(text: string): string {
  const trimmed = text.trim().replace(/\n/g, " ");
  return trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed;
}
