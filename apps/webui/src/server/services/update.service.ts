import pkg from "../../../../../package.json" with { type: "json" };
import type { UpdateRepo } from "../repositories/update.repo.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface UpdateStatus {
  /** Running version (from root package.json). */
  current: string;
  /** Latest release tag without leading "v", or null if unreachable. */
  latest: string | null;
  /** True iff latest is strictly greater than current via semver numeric compare. */
  hasUpdate: boolean;
  /** GitHub release page URL, or null when latest is null. */
  releaseUrl: string | null;
  /** ISO-8601 publish timestamp, or null. */
  publishedAt: string | null;
  /** Release notes markdown (may be empty). */
  releaseNotes: string;
  /** When this snapshot was taken (epoch ms). */
  checkedAt: number;
}

/**
 * Strip a leading "v" so "v0.3.0" and "0.3.0" compare equal.
 * Returns null on malformed input.
 */
function normalizeVersion(raw: string): string | null {
  const trimmed = raw.trim().replace(/^v/i, "");
  if (!/^\d+(\.\d+){0,2}/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Numeric semver compare of two "X.Y.Z" strings, ignoring any pre-release suffix.
 * Returns -1 / 0 / 1 matching Array.sort conventions.
 */
function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => {
    const core = v.split("-")[0] ?? v;
    return core.split(".").map((p) => Number.parseInt(p, 10) || 0);
  };
  const as = parse(a);
  const bs = parse(b);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

export function createUpdateService(updateRepo: UpdateRepo) {
  const current = pkg.version;
  let cache: { data: UpdateStatus; expiresAt: number } | null = null;
  let inflight: Promise<UpdateStatus> | null = null;

  async function refresh(): Promise<UpdateStatus> {
    const release = await updateRepo.fetchLatestRelease();
    const now = Date.now();

    if (!release) {
      const snapshot: UpdateStatus = {
        current,
        latest: null,
        hasUpdate: false,
        releaseUrl: null,
        publishedAt: null,
        releaseNotes: "",
        checkedAt: now,
      };
      // Cache network failures for a shorter window (5 min) so we retry sooner.
      cache = { data: snapshot, expiresAt: now + 5 * 60 * 1000 };
      return snapshot;
    }

    const latest = normalizeVersion(release.tag);
    const hasUpdate = latest != null && compareVersions(latest, current) > 0;

    const snapshot: UpdateStatus = {
      current,
      latest,
      hasUpdate,
      releaseUrl: release.htmlUrl,
      publishedAt: release.publishedAt || null,
      releaseNotes: release.body,
      checkedAt: now,
    };
    cache = { data: snapshot, expiresAt: now + CACHE_TTL_MS };
    return snapshot;
  }

  return {
    getCurrentVersion(): string {
      return current;
    },

    /**
     * Returns the cached status if fresh, otherwise triggers a single shared
     * fetch. `force` bypasses the cache.
     */
    async getStatus(force = false): Promise<UpdateStatus> {
      const now = Date.now();
      if (!force && cache && cache.expiresAt > now) return cache.data;
      if (inflight) return inflight;
      inflight = refresh().finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}

export type UpdateService = ReturnType<typeof createUpdateService>;
