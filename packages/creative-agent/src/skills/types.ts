export type SkillEnvironment = "creative" | "meta";

export interface SkillMetadata {
  name: string;
  description: string;
  metadata?: Record<string, string>;
  /** Hide from the model-facing catalog so the model never self-activates. */
  disableModelInvocation?: boolean;
  /**
   * Which session environment this skill belongs to.
   * - `"creative"` (default) — appears in creative session catalogs
   * - `"meta"` — appears only in meta session catalogs (project configuration tasks)
   */
  environment?: SkillEnvironment;
}

export interface SkillRecord {
  meta: SkillMetadata;
  baseDir: string;    // Parent directory of SKILL.md
  body: string;       // Markdown body (tier 2 content)
}
