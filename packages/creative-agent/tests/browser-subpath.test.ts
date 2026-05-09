/**
 * Browser-subpath build smoke test (CI gate).
 *
 * `@agentchan/creative-agent/browser` must stay free of fs / `node:*` /
 * LLM runtime so host webui client and (post-iframe) iframe-side adapter
 * can import the same canonical surface. This test bundles the entry
 * with `target: "browser"` and asserts the dependency graph.
 */

import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BROWSER_ENTRY = resolve(HERE, "..", "src", "browser.ts");

describe("@agentchan/creative-agent/browser subpath", () => {
  test("Bun.build for target=browser succeeds and is free of node primitives + LLM runtime", async () => {
    const result = await Bun.build({
      entrypoints: [BROWSER_ENTRY],
      target: "browser",
      format: "esm",
      splitting: false,
      minify: false,
    });

    if (!result.success) {
      const messages = result.logs.map((l) => String(l.message ?? l)).join("\n");
      throw new Error(`Bun.build failed:\n${messages}`);
    }

    expect(result.outputs.length).toBeGreaterThan(0);

    const code = await result.outputs[0]!.text();

    // No `node:*` builtins should appear in the bundle (target=browser would
    // emit them as runtime imports rather than polyfilling them away).
    const forbiddenNodeBuiltins = [
      "node:fs",
      "node:fs/promises",
      "node:path",
      "node:crypto",
      "node:url",
      "node:os",
      "node:child_process",
      "node:stream",
      "node:net",
      "node:worker_threads",
    ];
    for (const term of forbiddenNodeBuiltins) {
      expect(code).not.toContain(term);
    }

    // No LLM-runtime packages should be reachable from the browser surface.
    // The forbidden list intentionally excludes `@mariozechner/pi-ai` and
    // `@mariozechner/pi-agent-core` because those packages export pure
    // types that are tree-shaken to nothing under `import type`.
    const forbiddenLlmRuntimes = [
      "@mariozechner/pi-coding-agent",
      "@mariozechner/pi-agent-core/agent",
      "@google/genai",
      "@agentchan/grep",
      "@agentchan/estimate-tokens",
    ];
    for (const term of forbiddenLlmRuntimes) {
      expect(code).not.toContain(term);
    }
  });
});
