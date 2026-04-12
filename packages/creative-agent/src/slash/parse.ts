export interface ParsedSlashCommand {
  name: string;
  args: string;
}

/**
 * Returns non-null only when input matches `/skill-name [args...]` —
 * lowercase-hyphen name shape, args = rest after first whitespace.
 */
export function parseSlashInput(text: string): ParsedSlashCommand | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) return null;
  const body = trimmed.slice(1);
  const m = body.match(/^([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return { name: m[1], args: (m[2] ?? "").trim() };
}

export function serializeCommand(name: string, args: string): string {
  const n = `<command-name>/${name}</command-name>`;
  return args.trim() ? `${n}\n<command-args>${args.trim()}</command-args>` : n;
}
