import { resolve, relative, sep, isAbsolute } from "node:path";

/**
 * Resolve `userPath` relative to `projectDir`, throwing if the result escapes
 * the project directory. Pure lexical check — does not follow symlinks.
 *
 * Rejects: absolute paths, parent traversal (`../foo`), and Windows
 * alternate-drive paths (which `relative()` returns as absolute).
 *
 * Allows: empty string and "." (= projectDir itself), and any path that
 * lexically resolves inside projectDir.
 *
 * Distinct from the server's `resolveProjectFile` (project.repo.ts), which
 * returns `null` for HTTP 404 mapping and adds a `HIDDEN_ROOTS` policy. This
 * tool-side variant throws so the agent receives an error result and can
 * self-correct, and does not block `SYSTEM.md`/`skills/` access.
 */
export function resolveInProject(projectDir: string, userPath: string): string {
  const abs = resolve(projectDir, userPath);
  const rel = relative(projectDir, abs);
  if (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel))
  ) {
    return abs;
  }
  throw new Error(`path outside project: ${userPath}`);
}
