// Bundle a project's renderer.ts (or renderer/index.ts) into a browser-ready
// ES module. Used by both the webui server and the creative-agent's
// validate-renderer tool.
//
// Policy:
// - Project-local relative imports must stay inside projectDir.
// - Only @agentchan/renderer-{runtime,types} may be imported by bare specifier.
// - All other bare specifiers (npm, node:*, URLs) are rejected pre-flight.

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, relative, dirname, isAbsolute } from "node:path";

export interface BuildRendererOptions {
  /** Absolute path to @agentchan/renderer-runtime's entry file (src/index.ts). */
  runtimeEntry: string;
}

export interface BuildSuccess {
  js: string;
  /** Absolute paths of files whose mtime participates in cache invalidation. */
  sources: string[];
}

export interface BuildFailure {
  error: string;
}

export type BuildResult = BuildSuccess | BuildFailure;

const RUNTIME_SPEC = "@agentchan/renderer-runtime";
const TYPES_SPEC = "@agentchan/renderer-types";
const ALLOWED_BARE = new Set([RUNTIME_SPEC, TYPES_SPEC]);

// Hoisted once — `typeof Bun.build === "function"` is invariant for the life
// of a process, and the fallback transpile cache keeps runtime-JS stable.
interface BunApi {
  build?: (cfg: unknown) => Promise<BunBuildResult>;
  Transpiler?: new (o: { loader: string }) => { transformSync: (s: string) => string };
}
interface BunBuildResult {
  success: boolean;
  logs: { message: string; level: string }[];
  outputs: { text(): Promise<string>; path: string }[];
}
const bun = (globalThis as { Bun?: BunApi }).Bun ?? {};
const HAS_BUN_BUILD = typeof bun.build === "function";

function resolveEntry(projectDir: string): string | null {
  for (const candidate of [join(projectDir, "renderer", "index.ts"), join(projectDir, "renderer.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function buildRenderer(
  projectDir: string,
  opts: BuildRendererOptions,
): Promise<BuildResult> {
  const entry = resolveEntry(projectDir);
  if (!entry) return { error: "renderer.ts not found" };

  if (HAS_BUN_BUILD) {
    try {
      return await buildWithBunBuild(entry, projectDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const fallback = await buildWithTranspiler(entry, opts);
      if ("error" in fallback) {
        return { error: `Bun.build failed: ${message}\nFallback also failed: ${fallback.error}` };
      }
      return fallback;
    }
  }

  return buildWithTranspiler(entry, opts);
}

async function buildWithBunBuild(entry: string, projectDir: string): Promise<BuildResult> {
  const policyError = await checkImportPolicy(entry, projectDir);
  if (policyError) return { error: policyError };

  const result = await bun.build!({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "none",
    external: [TYPES_SPEC],
  });

  if (!result.success) {
    const messages = result.logs
      .filter((l) => l.level === "error")
      .map((l) => l.message)
      .join("\n");
    return { error: `transpile: ${messages || "Bun.build failed"}` };
  }
  const output = result.outputs[0];
  if (!output) return { error: "transpile: no output produced" };

  const js = await output.text();
  // Full dep graph isn't tracked here — the service layer invalidates the
  // cache on any write through ProjectRepo, which covers all in-app mutations.
  return { js, sources: [entry] };
}

async function checkImportPolicy(entry: string, projectDir: string): Promise<string | null> {
  const visited = new Set<string>();
  const queue: string[] = [resolve(entry)];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (!isInside(file, projectDir)) continue;

    let source: string;
    try {
      source = await readFile(file, "utf-8");
    } catch {
      continue;
    }

    const importRx = /\bimport\s+(?:type\s+)?[\s\S]*?\bfrom\s*["']([^"']+)["']/g;
    const dynamicRx = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
    const specs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = importRx.exec(source)) !== null) if (m[1]) specs.push(m[1]);
    while ((m = dynamicRx.exec(source)) !== null) if (m[1]) specs.push(m[1]);

    const fileDir = dirname(file);
    for (const spec of specs) {
      if (spec.startsWith("./") || spec.startsWith("../") || isAbsolute(spec)) {
        const resolved = resolve(fileDir, spec);
        if (!isInside(resolved, projectDir)) {
          return `resolve: import "${spec}" in ${relative(projectDir, file) || file} escapes the project directory`;
        }
        for (const c of walkerCandidates(resolved)) {
          if (existsSync(c)) queue.push(c);
        }
      } else if (!ALLOWED_BARE.has(spec)) {
        return `resolve: import "${spec}" is not in the allowlist. Only relative paths and @agentchan/renderer-{runtime,types} are permitted.`;
      }
    }
  }
  return null;
}

// TS-style imports write `.js` for a `.ts` source. Handle that plus index.* fallbacks.
function walkerCandidates(resolved: string): string[] {
  if (extname(resolved) === "") {
    return [resolved + ".ts", resolved + ".js", join(resolved, "index.ts"), join(resolved, "index.js")];
  }
  const out = [resolved];
  if (resolved.endsWith(".js")) out.push(resolved.slice(0, -3) + ".ts");
  else if (resolved.endsWith(".mjs")) out.push(resolved.slice(0, -4) + ".mts");
  return out;
}

// Runtime transpile result is invariant per runtimeEntry within a process.
const transpiledRuntimeCache = new Map<string, string>();

async function getTranspiledRuntime(runtimeEntry: string): Promise<string> {
  const hit = transpiledRuntimeCache.get(runtimeEntry);
  if (hit !== undefined) return hit;
  if (!bun.Transpiler) throw new Error("Bun.Transpiler unavailable");
  const source = await readFile(runtimeEntry, "utf-8");
  const js = new bun.Transpiler({ loader: "ts" }).transformSync(source);
  transpiledRuntimeCache.set(runtimeEntry, js);
  return js;
}

// Build a prologue that wraps renderer-runtime in an IIFE and destructures
// every `export function` name back into the top-level scope, so the renderer
// body's (stripped) named imports still resolve. Destructure list is derived
// dynamically from the transpiled runtime — no hand-maintained export list.
function buildRuntimePrologue(runtimeJs: string): string {
  const names = new Set<string>();
  const fnRx = /\bexports\.(\w+)\s*=/g;
  const bodyJs = runtimeJs.replace(/export\s+function\s+(\w+)/g, (_m, n: string) => {
    names.add(n);
    return `exports.${n} = function ${n}`;
  });
  // Any surviving `exports.foo = ...` from the regex above becomes a name.
  let m: RegExpExecArray | null;
  while ((m = fnRx.exec(bodyJs)) !== null) names.add(m[1]!);
  const destructure = names.size > 0 ? `const { ${[...names].join(", ")} } = __rendererRuntime;\n` : "";
  return `const __rendererRuntime = (() => {\n  const exports = {};\n${bodyJs}\n  return exports;\n})();\n${destructure}`;
}

/**
 * Fallback for runtimes without Bun.build: transpile the flat renderer.ts
 * directly, strip @agentchan/renderer-* imports, and prepend the runtime
 * source so named helpers still resolve. Multi-file renderer/ is not supported.
 */
async function buildWithTranspiler(entry: string, opts: BuildRendererOptions): Promise<BuildResult> {
  try {
    if (!bun.Transpiler) return { error: "transpile: Bun.Transpiler unavailable" };
    const source = await readFile(entry, "utf-8");
    const transpiler = new bun.Transpiler({ loader: "ts" });
    let body = transpiler.transformSync(source);

    const importRx = /^\s*import[\s\S]*?from\s*["']([^"']+)["']/gm;
    const forbidden: string[] = [];
    const runtimeStmts: string[] = [];
    body.replace(importRx, (match, spec: string) => {
      if (ALLOWED_BARE.has(spec)) runtimeStmts.push(match);
      else forbidden.push(spec);
      return match;
    });
    if (forbidden.length > 0) {
      return {
        error:
          `resolve: fallback transpiler cannot resolve imports: ${forbidden.join(", ")}. ` +
          `Use a flat renderer.ts or run on a Bun runtime that supports Bun.build.`,
      };
    }
    for (const stmt of runtimeStmts) body = body.replace(stmt, "");

    const runtimeJs = await getTranspiledRuntime(opts.runtimeEntry);
    return { js: buildRuntimePrologue(runtimeJs) + body, sources: [entry, opts.runtimeEntry] };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `transpile: ${message}` };
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export interface BundleCache {
  get(slug: string): string | null;
  set(slug: string, js: string, sources: string[]): void;
  invalidate(slug: string): void;
}

interface CacheEntry {
  js: string;
  sigs: Map<string, number>;
}

// Bounded in practice by project count. Cache mtime tracks external-to-repo
// mutations (e.g. edits to the shared runtime source in dev); in-project
// writes are invalidated directly by the service layer.
export function createBundleCache(): BundleCache {
  const store = new Map<string, CacheEntry>();
  return {
    get(slug) {
      const entry = store.get(slug);
      if (!entry) return null;
      for (const [path, sig] of entry.sigs) {
        try {
          if (statSync(path).mtimeMs !== sig) {
            store.delete(slug);
            return null;
          }
        } catch {
          store.delete(slug);
          return null;
        }
      }
      return entry.js;
    },
    set(slug, js, sources) {
      const sigs = new Map<string, number>();
      for (const path of sources) {
        try {
          sigs.set(path, statSync(path).mtimeMs);
        } catch {
          // file vanished mid-build — skip
        }
      }
      store.set(slug, { js, sigs });
    },
    invalidate(slug) {
      store.delete(slug);
    },
  };
}
