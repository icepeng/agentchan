import { Database } from "bun:sqlite";
import { join } from "node:path";
import { DATA_DIR } from "../paths.js";

const db = new Database(join(DATA_DIR, "settings.db"));
db.run(
  "CREATE TABLE IF NOT EXISTS api_keys (provider TEXT PRIMARY KEY, key TEXT NOT NULL)",
);
db.run(
  "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
);

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "···" + key.slice(-4);
}

export function getApiKey(provider: string): string | null {
  const row = db.query("SELECT key FROM api_keys WHERE provider = ?").get(provider) as
    | { key: string }
    | null;
  return row?.key ?? null;
}

export function getAllApiKeys(): Record<string, string> {
  const rows = db.query("SELECT provider, key FROM api_keys").all() as {
    provider: string;
    key: string;
  }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.provider] = maskKey(row.key);
  }
  return result;
}

export function setApiKey(provider: string, key: string): void {
  db.run(
    "INSERT INTO api_keys (provider, key) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET key = excluded.key",
    [provider, key],
  );
}

export function deleteApiKey(provider: string): void {
  db.run("DELETE FROM api_keys WHERE provider = ?", [provider]);
}

// --- App Settings ---

export function getAppSetting(key: string): string | null {
  const row = db.query("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | null;
  return row?.value ?? null;
}

export function setAppSetting(key: string, value: string): void {
  db.run(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
