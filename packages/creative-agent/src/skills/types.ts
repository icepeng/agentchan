export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  metadata?: Record<string, string>;
  /** Auto-inject the skill body at conversation root (and on compact). */
  alwaysActive?: boolean;
  /** Hide from the model-facing catalog so the model never self-activates. */
  disableModelInvocation?: boolean;
}

export interface SkillRecord {
  meta: SkillMetadata;
  location: string;   // Absolute path to SKILL.md
  baseDir: string;    // Parent directory of SKILL.md
  body: string;       // Markdown body (tier 2 content)
}
