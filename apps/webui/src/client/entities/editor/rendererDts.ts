// Fetch renderer-types + renderer-runtime source from the server and extract
// completion options for the CodeMirror autocomplete plugin. The parser is
// deliberately minimal (top-level `export interface` fields and `export function`
// signatures) — that covers the common renderer authoring flow and avoids
// pulling a real TS language service into the bundle. Falls back to the
// previously-hardcoded options when the fetch or parse fails.
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

export interface RendererTypeInfo {
  /** interface name → fields */
  interfaces: Map<string, Array<{ name: string; type: string }>>;
  /** runtime top-level function names with their signature strings */
  runtime: Array<{ name: string; signature: string }>;
}

let cache: RendererTypeInfo | null = null;
let pending: Promise<RendererTypeInfo> | null = null;

async function loadInfo(): Promise<RendererTypeInfo> {
  if (cache) return cache;
  if (pending) return pending;

  pending = (async () => {
    const [typesRes, runtimeRes] = await Promise.all([
      fetch("/api/system/renderer-types.ts").catch(() => null),
      fetch("/api/system/renderer-runtime.ts").catch(() => null),
    ]);
    const typesText = typesRes && typesRes.ok ? await typesRes.text() : "";
    const runtimeText =
      runtimeRes && runtimeRes.ok ? await runtimeRes.text() : "";

    const info: RendererTypeInfo = {
      interfaces: parseInterfaces(typesText),
      runtime: parseRuntimeExports(runtimeText),
    };
    cache = info;
    return info;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

// Triggers a background fetch so the first typing-driven completion isn't slow.
export function prefetchRendererTypes(): void {
  void loadInfo();
}

// Match `export interface Name {\n  field: type;\n  ...}` — top-level only.
// Body braces nested deeper than one level are not supported (sufficient for
// the current type surface; complex shapes degrade to the fallback path).
function parseInterfaces(src: string): Map<string, Array<{ name: string; type: string }>> {
  const out = new Map<string, Array<{ name: string; type: string }>>();
  const rx = /export\s+interface\s+(\w+)\s*{([^{}]*)}/g;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(src)) !== null) {
    const name = match[1];
    const body = match[2];
    if (!name || !body) continue;
    const fields: Array<{ name: string; type: string }> = [];
    const fieldRx = /(\w+)\s*\??\s*:\s*([^;\n]+);/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRx.exec(body)) !== null) {
      const fname = fm[1];
      const ftype = fm[2]?.trim();
      if (fname && ftype) fields.push({ name: fname, type: ftype });
    }
    out.set(name, fields);
  }
  return out;
}

// Match `export function name(args): ret` — signature is descriptive only.
function parseRuntimeExports(src: string): Array<{ name: string; signature: string }> {
  const out: Array<{ name: string; signature: string }> = [];
  const rx = /export\s+function\s+(\w+)\s*(\([^)]*\)(?:\s*:\s*[^\n{]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(src)) !== null) {
    const name = match[1];
    const sig = match[2]?.trim();
    if (name && sig) out.push({ name, signature: `(fn) ${name}${sig}` });
  }
  return out;
}

// Variable-name heuristics for `.`-completion. Mirrors the legacy hardcoded
// table but is now cheap to extend without changing code — add a variable
// pattern here, and the fields come from whichever interface we map to.
function identifierTypeHint(varName: string): string | null {
  if (varName === "ctx") return "RenderContext";
  if (/^(f|file|entry|item|doc|textFile|tf)$/i.test(varName)) return "TextFile";
  return null;
}

export async function rendererCompletions(
  context: CompletionContext,
): Promise<CompletionResult | null> {
  // `.`-completion on a known identifier name
  const dotMatch = context.matchBefore(/\b(\w+)\.(\w*)$/);
  if (dotMatch) {
    const info = await loadInfo();
    const text = dotMatch.text;
    const dotPos = text.lastIndexOf(".");
    const varName = text.substring(0, dotPos);
    const from = dotMatch.from + dotPos + 1;

    const typeName = identifierTypeHint(varName);
    if (!typeName) return null;

    const fields = info.interfaces.get(typeName);
    if (!fields || fields.length === 0) return null;

    return {
      from,
      options: fields.map((f) => ({
        label: f.name,
        type: "property",
        detail: f.type,
      })),
    };
  }

  // Top-of-word completion surfaces runtime helper names as they're typed
  const wordMatch = context.matchBefore(/\w+$/);
  if (wordMatch && wordMatch.from !== wordMatch.to) {
    const info = await loadInfo();
    if (info.runtime.length === 0) return null;
    return {
      from: wordMatch.from,
      options: info.runtime.map((fn) => ({
        label: fn.name,
        type: "function",
        detail: fn.signature,
      })),
      // Do not block other sources — this is a supplementary list.
      validFor: /^\w*$/,
    };
  }

  return null;
}
