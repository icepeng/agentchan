export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  metadata?: Record<string, unknown>;
  /** When true, the skill body is auto-injected as the first user message of every new session. */
  alwaysActive?: boolean;
  /** When true, the skill is hidden from the model's catalog (no autonomous activate_skill). Slash invocation still works. */
  disableModelInvocation?: boolean;
}

export interface SkillRecord {
  meta: SkillMetadata;
  location: string;   // Absolute path to SKILL.md
  baseDir: string;    // Parent directory of SKILL.md
  body: string;       // Markdown body (tier 2 content)
}
