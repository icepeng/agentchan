export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string;
}

export interface SkillRecord {
  meta: SkillMetadata;
  location: string;   // Absolute path to SKILL.md
  baseDir: string;    // Parent directory of SKILL.md
  body: string;       // Markdown body (tier 2 content)
}

/** Tools that require explicit opt-in via allowed-tools in a skill. */
export const RESTRICTED_TOOLS = new Set(["bash"]);

/** Parse a space-delimited allowed-tools string into a Set. Returns null if absent/empty. */
export function parseAllowedTools(raw: string | undefined): Set<string> | null {
  const s = raw?.trim();
  if (!s) return null;
  return new Set(s.split(/\s+/));
}

/** Collect restricted tools that any skill opts into via allowed-tools. */
export function collectGrantedRestrictedTools(skills: Map<string, SkillRecord>): Set<string> {
  const granted = new Set<string>();
  for (const skill of skills.values()) {
    const parsed = parseAllowedTools(skill.meta.allowedTools);
    if (parsed) {
      for (const t of parsed) {
        if (RESTRICTED_TOOLS.has(t)) granted.add(t);
      }
    }
  }
  return granted;
}
