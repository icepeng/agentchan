/**
 * Explicit context caching for Gemini models without implicit caching.
 *
 * Pure onPayload hook — self-contained, no external state coupling.
 * On every cache creation, includes all contents except the last one
 * to maximize the 90% read discount.
 *
 * Activation: uses the free countTokens API to check actual token count.
 * Caching starts once contents exceed ACTIVATION_THRESHOLD.
 * Cache validity is checked via the free caches.get API — no client-side
 * TTL tracking needed.
 */

import { GoogleGenAI } from "@google/genai";
import * as log from "../logger.js";

interface CacheEntry {
  name: string;
  configHash: string;
  cachedCount: number;
}

const ACTIVATION_THRESHOLD = 2048;
const CACHE_TTL_SEC = 300;

const entries = new Map<string, CacheEntry>();

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

type Params = { model: string; contents: unknown[]; config: Record<string, unknown> };

function patchPayload(params: Params, entry: CacheEntry) {
  const { systemInstruction: _, tools: __, ...restConfig } = params.config;
  return {
    ...params,
    contents: entry.cachedCount > 0 ? params.contents.slice(entry.cachedCount) : params.contents,
    config: { ...restConfig, cachedContent: entry.name },
  };
}

/**
 * Create a self-contained onPayload hook for explicit context caching.
 * Returns a function directly usable as Agent's `onPayload` option.
 */
export function createGoogleCacheHook(apiKey: string, sessionId: string) {
  const genai = new GoogleGenAI({ apiKey });
  let activated = false;

  async function isCacheAlive(name: string): Promise<boolean> {
    try {
      await genai.caches.get({ name });
      return true;
    } catch {
      return false;
    }
  }

  return async (payload: unknown, model: { id: string; api: string }) => {
    if (model.api !== "google-generative-ai") return;

    const params = payload as Params;
    if (!params.config?.systemInstruction && !params.config?.tools) return;

    const configHash = djb2(JSON.stringify({ s: params.config.systemInstruction, t: params.config.tools }));
    let entry = entries.get(sessionId);

    // Reuse existing cache if config unchanged and remote cache still alive
    if (entry && entry.configHash === configHash && await isCacheAlive(entry.name)) {
      return patchPayload(params, entry);
    }

    if (!activated) {
      try {
        const { totalTokens } = await genai.models.countTokens({
          model: params.model,
          contents: params.contents as any,
        });
        if ((totalTokens ?? 0) < ACTIVATION_THRESHOLD) return;
      } catch {
        if (JSON.stringify(payload).length < ACTIVATION_THRESHOLD * 4) return;
      }
      activated = true;
      log.info("cache", "activated");
    }

    if (entry) {
      genai.caches.delete({ name: entry.name }).catch(() => {});
      entries.delete(sessionId);
    }

    const cacheCount = Math.max(params.contents.length - 1, 0);

    try {
      const cache = await genai.caches.create({
        model: params.model,
        config: {
          ...(params.config.systemInstruction != null && { systemInstruction: params.config.systemInstruction as string }),
          ...(params.config.tools != null && { tools: params.config.tools as any }),
          ...(cacheCount > 0 && { contents: params.contents.slice(0, cacheCount) as any }),
          ttl: `${CACHE_TTL_SEC}s`,
        },
      });
      if (!cache.name) {
        log.error("cache", "create returned no name");
        return;
      }
      entry = {
        name: cache.name,
        configHash,
        cachedCount: cacheCount,
      };
      entries.set(sessionId, entry);
      log.info("cache", `created (${(cache.usageMetadata as any)?.totalTokenCount ?? "?"} tokens, ${cacheCount} msgs)`);
      return patchPayload(params, entry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("cache", `create failed: ${msg}`);
      return;
    }
  };
}

/** Remove local cache entry. Remote cache expires via TTL. */
export function clearGoogleCache(sessionId: string): void {
  entries.delete(sessionId);
}
