export interface SkillMetadata {
  name: string;
  description: string;
  metadata?: Record<string, string>;
  /** Hide from the model-facing catalog so the model never self-activates. */
  disableModelInvocation?: boolean;
}

export interface SkillRecord {
  meta: SkillMetadata;
  location: string;   // Absolute path to SKILL.md
  baseDir: string;    // Parent directory of SKILL.md
  body: string;       // Markdown body (tier 2 content)
}
