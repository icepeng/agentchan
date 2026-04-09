/**
 * Filesystem-safe slug for project folder names. Strips reserved chars,
 * collapses whitespace to hyphens, lowercases ASCII, and preserves Korean.
 */
export function slugify(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[A-Z]/g, (c) => c.toLowerCase())
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "project"
  );
}
