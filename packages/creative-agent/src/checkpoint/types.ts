/**
 * Checkpoint types — file snapshot data captured before agent tool modifications.
 */

export interface FileSnapshot {
  /** Relative path from project directory (e.g., "files/characters/elara.md") */
  path: string;
  /** "modified" = existing file was changed, "created" = new file was created */
  action: "modified" | "created";
  /** Original content before modification. null for newly created files. */
  originalContent: string | null;
}
