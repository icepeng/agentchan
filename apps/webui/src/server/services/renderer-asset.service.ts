import { join } from "node:path";
import { buildRendererBundle } from "@agentchan/renderer/build";

/**
 * Pre-built renderer assets keyed by digest. The digest is the stable
 * cache-busting `?v=` query param — when the host iframe URL pins to a
 * specific digest, the matching asset is served `immutable`.
 *
 * We keep just the latest digest per slug. The digest is recomputed on every
 * request — Bun.build for these tiny renderer entries is sub-100ms — so
 * stale-cache concerns are limited to the brief overlap between two consumer
 * tabs, which the digest itself disambiguates.
 */
export interface RendererAsset {
  digest: string;
  js: string;
  css: string;
}

export interface RendererAssetService {
  build(slug: string): Promise<RendererAsset | null>;
}

export function createRendererAssetService(
  projectsDir: string,
): RendererAssetService {
  return {
    async build(slug) {
      const bundle = await buildRendererBundle(join(projectsDir, slug));
      if (bundle === null) return null;
      const css = bundle.css.join("\n");
      const digest = computeDigest(bundle.js, css);
      return { digest, js: bundle.js, css };
    },
  };
}

function computeDigest(js: string, css: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(js);
  hasher.update("\n");
  hasher.update(css);
  return hasher.digest("hex").slice(0, 16);
}
