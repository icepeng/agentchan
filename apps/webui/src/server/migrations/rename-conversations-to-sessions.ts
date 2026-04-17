import { readdir, rename, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Startup migration: rename each project's `conversations/` directory to
 * `sessions/` and leave a `conversations.backup/` copy as a safety net.
 *
 * Idempotent — projects that already have `sessions/` are skipped. Failures
 * in one project don't block the others; the server logs and moves on so
 * the user can at least access unaffected projects.
 *
 * Remove the migration once all known deployments have run at least once.
 */
export async function migrateConversationsToSessions(projectsDir: string): Promise<void> {
  if (!existsSync(projectsDir)) return;

  let entries: string[];
  try {
    entries = await readdir(projectsDir);
  } catch {
    return;
  }

  for (const name of entries) {
    const projectDir = join(projectsDir, name);
    try {
      const s = await stat(projectDir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    const oldDir = join(projectDir, "conversations");
    const newDir = join(projectDir, "sessions");
    const backupDir = join(projectDir, "conversations.backup");

    if (!existsSync(oldDir)) continue;
    if (existsSync(newDir)) continue;

    try {
      if (!existsSync(backupDir)) {
        await cp(oldDir, backupDir, { recursive: true });
      }
      await rename(oldDir, newDir);
      console.log(
        `[migrate] ${name}: conversations/ → sessions/ (backup at conversations.backup/)`,
      );
    } catch (err) {
      console.error(`[migrate] ${name}: failed to rename conversations/ → sessions/`, err);
    }
  }
}
