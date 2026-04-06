import { Database } from "bun:sqlite";
import { join } from "node:path";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "···" + key.slice(-4);
}

export function createSettingsRepo(dataDir: string) {
  const db = new Database(join(dataDir, "settings.db"));
  db.run(
    "CREATE TABLE IF NOT EXISTS api_keys (provider TEXT PRIMARY KEY, key TEXT NOT NULL)",
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );

  return {
    getApiKey(provider: string): string | null {
      const row = db.query("SELECT key FROM api_keys WHERE provider = ?").get(provider) as
        | { key: string }
        | null;
      return row?.key ?? null;
    },

    getAllApiKeys(): Record<string, string> {
      const rows = db.query("SELECT provider, key FROM api_keys").all() as {
        provider: string;
        key: string;
      }[];
      const result: Record<string, string> = {};
      for (const row of rows) {
        result[row.provider] = maskKey(row.key);
      }
      return result;
    },

    setApiKey(provider: string, key: string): void {
      db.run(
        "INSERT INTO api_keys (provider, key) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET key = excluded.key",
        [provider, key],
      );
    },

    deleteApiKey(provider: string): void {
      db.run("DELETE FROM api_keys WHERE provider = ?", [provider]);
    },

    getAppSetting(key: string): string | null {
      const row = db.query("SELECT value FROM app_settings WHERE key = ?").get(key) as
        | { value: string }
        | null;
      return row?.value ?? null;
    },

    setAppSetting(key: string, value: string): void {
      db.run(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
