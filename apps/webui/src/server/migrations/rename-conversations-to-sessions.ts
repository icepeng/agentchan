import { readdir, rename, cp } from "node:fs/promises";
import { existsSync, type Dirent } from "node:fs";
import { join } from "node:path";

/**
 * Startup migration: rename each project's `conversations/` directory to
 * `sessions/` and leave a `conversations.backup/` copy as a safety net.
 *
 * Idempotent — projects that already have `sessions/` are skipped. Per-project
 * failures are isolated so unaffected projects still load. Projects run in
 * parallel since each touches an independent directory.
 *
 * Remove the migration once all known deployments have run at least once.
 */
export async function migrateConversationsToSessions(projectsDir: string): Promise<void> {
  if (!existsSync(projectsDir)) return;

  let entries: Dirent[];
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return;
  }

  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => migrateOne(join(projectsDir, entry.name), entry.name)),
  );

  const leftoverBackups = results.filter((r) => r.leftoverBackup).map((r) => r.name);
  if (leftoverBackups.length > 0) {
    console.log(
      `[migrate] ${leftoverBackups.length} project(s) still have conversations.backup/ — safe to delete after verifying sessions/: ${leftoverBackups.join(", ")}`,
    );
  }
}

async function migrateOne(projectDir: string, name: string): Promise<{ name: string; leftoverBackup: boolean }> {
  const oldDir = join(projectDir, "conversations");
  const newDir = join(projectDir, "sessions");
  const backupDir = join(projectDir, "conversations.backup");

  const newExists = existsSync(newDir);
  const oldExists = existsSync(oldDir);
  const leftoverBackup = newExists && existsSync(backupDir);

  if (!oldExists || newExists) return { name, leftoverBackup };

  try {
    if (!existsSync(backupDir)) {
      await cp(oldDir, backupDir, { recursive: true });
    }
    await rename(oldDir, newDir);
    console.log(`[migrate] ${name}: conversations/ → sessions/ (backup at conversations.backup/)`);
    return { name, leftoverBackup: true };
  } catch (err) {
    console.error(`[migrate] ${name}: failed to rename conversations/ → sessions/`, err);
    return { name, leftoverBackup };
  }
}
