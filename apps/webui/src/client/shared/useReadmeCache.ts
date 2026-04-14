import { useEffect, useState } from "react";
import type { ReadmeDoc } from "./ReadmeView.js";

/**
 * Lazy-load README docs by slug, cached in-component. Returns the doc for the
 * current slug once fetched, or `undefined` while loading / when slug is null.
 *
 * Callers must pass a stable `fetcher` reference (top-level import is fine).
 */
export function useReadmeCache(
  slug: string | null | undefined,
  fetcher: (slug: string) => Promise<ReadmeDoc>,
): ReadmeDoc | undefined {
  const [cache, setCache] = useState<Record<string, ReadmeDoc>>({});

  useEffect(() => {
    if (!slug || cache[slug]) return;
    let cancelled = false;
    void fetcher(slug).then((doc) => {
      if (cancelled) return;
      setCache((prev) => (prev[slug] ? prev : { ...prev, [slug]: doc }));
    });
    return () => { cancelled = true; };
  }, [slug, cache, fetcher]);

  return slug ? cache[slug] : undefined;
}
