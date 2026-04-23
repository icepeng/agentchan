/**
 * Single source of truth for SWR cache keys.
 *
 * Convention: tuple form `[entity, ...params] as const`. The first slot
 * (`key[0]`) is the entity discriminator — `shared/swr.ts::buildRoute`
 * dispatches on it. Keys here and routes there must stay in lockstep.
 *
 * Use the factory rather than inlining tuples — it keeps key shape
 * consistent across producers (queries) and consumers (mutate / evict).
 */
export const qk = {
  // --- Projects ---
  projects:        ()                          => ["projects"] as const,
  projectReadme:   (slug: string)              => ["projectReadme", slug] as const,
  workspaceFiles:  (slug: string)              => ["workspaceFiles", slug] as const,

  // --- Sessions ---
  sessions:        (slug: string)              => ["sessions", slug] as const,
  session:         (slug: string, id: string)  => ["session", slug, id] as const,

  // --- Skills ---
  skills:          (slug: string)              => ["skills", slug] as const,

  // --- Config / providers / auth ---
  config:          ()                          => ["config"] as const,
  providers:       ()                          => ["providers"] as const,
  apiKeys:         ()                          => ["apiKeys"] as const,
  oauthStatus:     (provider: string)          => ["oauthStatus", provider] as const,
  onboarding:      ()                          => ["onboarding"] as const,

  // --- Editor (file system) ---
  projectTree:     (slug: string)              => ["projectTree", slug] as const,

  // --- Templates ---
  templates:       ()                          => ["templates"] as const,
  templateReadme:  (slug: string)              => ["templateReadme", slug] as const,

  // --- Update / version ---
  version:         ()                          => ["version"] as const,
} as const;

export type QueryKey = readonly [string, ...unknown[]];

/**
 * Predicate for `mutate()` that matches every cache entry tagged with a
 * given project slug. Entity convention: slug lives at `key[1]` for
 * per-project keys (`sessions`, `session`, `skills`, `projectTree`, etc.),
 * so wiping a project is a single predicate eviction.
 */
export const matchesSlug =
  (slug: string) =>
  (key: unknown): boolean =>
    Array.isArray(key) && key.length > 1 && key[1] === slug;
