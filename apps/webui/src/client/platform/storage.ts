/**
 * Browser-side persistent state (localStorage). All localStorage access in
 * the client goes through this module — the ESLint rule `no-restricted-syntax`
 * bans direct `localStorage.*` calls everywhere else, so adding a new key
 * requires registering it in `localStore` below.
 *
 * When to use this vs settings.db (server SQLite):
 *   - localStorage (here):  UI state, device/browser preferences, dismissal
 *                            signals — stuff that's fine to be per-browser.
 *   - settings.db (server): values the agent actually reads (API keys,
 *                            active provider/model), secrets, and install-
 *                            scoped state (e.g. onboarding completion).
 */

const PREFIX = "agentchan-";

export interface Store<T> {
  read(): T;
  write(value: T): void;
  remove(): void;
  readonly fullKey: string;
}

/** Nullable string store — `null` means the key is unset. */
function stringStore(key: string): Store<string | null> {
  const fullKey = PREFIX + key;
  return {
    fullKey,
    read() {
      try {
        return localStorage.getItem(fullKey);
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        if (value === null) localStorage.removeItem(fullKey);
        else localStorage.setItem(fullKey, value);
      } catch {
        /* private mode / quota */
      }
    },
    remove() {
      try {
        localStorage.removeItem(fullKey);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Enum store — only accepts one of `values`; invalid / missing → `defaultValue`. */
function enumStore<T extends string>(
  key: string,
  values: readonly T[],
  defaultValue: T,
): Store<T> {
  const fullKey = PREFIX + key;
  const valid = new Set<string>(values);
  return {
    fullKey,
    read() {
      try {
        const v = localStorage.getItem(fullKey);
        return v !== null && valid.has(v) ? (v as T) : defaultValue;
      } catch {
        return defaultValue;
      }
    },
    write(value) {
      try {
        localStorage.setItem(fullKey, value);
      } catch {
        /* private mode / quota */
      }
    },
    remove() {
      try {
        localStorage.removeItem(fullKey);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Single registry for every browser-persistent key in the webui. Add new keys
 * here — never call `localStorage` directly in feature code.
 */
export const localStore = {
  /** Last project the user had active — restored on app load. */
  lastProject: stringStore("last-project"),
  /** Theme preference (system / light / dark). */
  theme: enumStore("theme", ["system", "light", "dark"] as const, "system"),
  /** Language preference (system / en / ko). */
  language: enumStore("language", ["system", "en", "ko"] as const, "system"),
  /** OS desktop notifications on stream completion. */
  notifications: enumStore("notifications", ["on", "off"] as const, "on"),
  /** Last update version the user dismissed — null before any dismissal. */
  updateDismissed: stringStore("update-dismissed"),
};
