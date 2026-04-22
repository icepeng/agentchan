import builtinTemplates from "../builtin-templates.json" with { type: "json" };
import { assertSafePathSegment } from "../paths.js";
import type { SettingsRepo } from "../repositories/settings.repo.js";

const USER_TRUST_KEY = "trust.templates";
const BUILTIN_SET: ReadonlySet<string> = new Set(builtinTemplates);

export class TrustRequiredError extends Error {
  constructor(public readonly template: string) {
    super(`Template "${template}" is not trusted`);
    this.name = "TrustRequiredError";
  }
}

export function createTemplateTrustService(settingsRepo: SettingsRepo) {
  function readUserTrusted(): Set<string> {
    const raw = settingsRepo.getAppSetting(USER_TRUST_KEY);
    if (!raw) return new Set();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((s): s is string => typeof s === "string"));
    } catch {
      return new Set();
    }
  }

  function writeUserTrusted(set: Set<string>): void {
    settingsRepo.setAppSetting(USER_TRUST_KEY, JSON.stringify([...set].sort()));
  }

  return {
    isTrusted(slug: string): boolean {
      if (BUILTIN_SET.has(slug)) return true;
      return readUserTrusted().has(slug);
    },

    isBuiltin(slug: string): boolean {
      return BUILTIN_SET.has(slug);
    },

    /** Snapshot for batch checks — callers iterating many slugs avoid N parses. */
    getUserTrusted(): ReadonlySet<string> {
      return readUserTrusted();
    },

    setTrust(slug: string, trusted: boolean): void {
      assertSafePathSegment(slug);
      if (BUILTIN_SET.has(slug)) return;
      const set = readUserTrusted();
      if (trusted ? !set.has(slug) : set.has(slug)) {
        if (trusted) set.add(slug);
        else set.delete(slug);
        writeUserTrusted(set);
      }
    },
  };
}

export type TemplateTrustService = ReturnType<typeof createTemplateTrustService>;
