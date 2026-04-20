import { join } from "node:path";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { scanWorkspaceFiles } from "../workspace/scan.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer.ts by transpiling and executing it with the current project files.

Returns rendered HTML on success, or a detailed error message with the failure phase (transpile / export / runtime).
Use this after writing or editing renderer.ts to verify it works before asking the user to check.`;

const MAX_HTML_CHARS = 3000;

// Minimal AgentState-shaped ctx for renderer execution outside a live session.
// Matches `EMPTY_AGENT_STATE` on the host: empty messages + not streaming.
const MOCK_STATE = {
  messages: [],
  isStreaming: false,
  pendingToolCalls: new Set<string>(),
};

const MOCK_ACTIONS = {
  send() {},
  fill() {},
};

interface RendererModule {
  render?: (ctx: unknown) => string;
  mount?: unknown;
  default?: { render?: (ctx: unknown) => string; mount?: unknown };
}

export function createValidateRendererTool(
  projectDir: string,
): AgentTool<typeof ValidateRendererParams, void> {
  return {
    name: "validate-renderer",
    description: DESCRIPTION,
    parameters: ValidateRendererParams,
    label: "Validate renderer",

    async execute(): Promise<AgentToolResult<void>> {
      // 1. Read renderer.ts
      const rendererPath = join(projectDir, "renderer.ts");
      let source: string;
      try {
        source = await readFile(rendererPath, "utf-8");
      } catch {
        return textResult("Error: renderer.ts not found in project root.");
      }

      // 2. Transpile TS → JS
      const transpiler = new Bun.Transpiler({ loader: "ts" });
      let js: string;
      try {
        js = transpiler.transformSync(source);
      } catch (e) {
        return textResult(
          `Transpile error:\n${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // 3. Scan workspace files
      const files = await scanWorkspaceFiles(join(projectDir, "files"));

      // Rewrite the `@agentchan/renderer-runtime` bare specifier to a
      // `globalThis.__rendererRuntime` destructure — the tmp file can't
      // resolve workspace specifiers, and we avoid a hard package dep so
      // creative-agent stays Node-only (renderer-runtime pulls in DOM lib).
      // `import { X as Y }` maps to `const { X: Y }` — ES import aliases
      // are invalid destructuring syntax otherwise.
      // Keep the regex in sync with apps/webui's project.service.ts.
      const rewritten = js.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']@agentchan\/renderer-runtime["']\s*;?/g,
        (_m, spec: string) =>
          `const {${spec.replace(/\s+as\s+/g, ": ")}} = globalThis.__rendererRuntime;`,
      );

      try {
        const runtime = await import(/* @vite-ignore */ "@agentchan/renderer-runtime" as string);
        (globalThis as unknown as { __rendererRuntime: unknown }).__rendererRuntime = runtime;
      } catch {
        // Stand-alone creative-agent: only legacy `render()` exports validate fully.
      }

      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, rewritten);
      try {
        const mod = (await import(tmpPath)) as RendererModule;

        // Legacy: a raw `render(ctx)` export. Call directly.
        const renderFn =
          typeof mod.render === "function"
            ? mod.render
            : typeof (mod.default as { render?: unknown } | undefined)?.render === "function"
              ? (mod.default as { render: (ctx: unknown) => string }).render
              : null;

        const ctx = { files, baseUrl: "/api/projects/_validate", state: MOCK_STATE, actions: MOCK_ACTIONS };

        if (renderFn) {
          const html: string = renderFn(ctx);
          const preview =
            html.length > MAX_HTML_CHARS
              ? html.slice(0, MAX_HTML_CHARS) + `\n...(truncated, ${html.length} chars total)`
              : html;
          return textResult(`OK — rendered ${html.length} chars.\n\n${preview}`);
        }

        // Mount contract: `defineRenderer(...)` wraps the render function and
        // exposes `{ mount, theme? }` without re-exporting the raw render.
        // We can't invoke mount without a DOM, so runtime preview is skipped
        // — the transpile + export check above is still a useful early signal.
        const hasMount =
          typeof mod.mount === "function" ||
          typeof (mod.default as { mount?: unknown } | undefined)?.mount === "function";

        if (hasMount) {
          return textResult(
            "OK — mount-contract export detected. Runtime HTML preview skipped (mount requires a browser DOM). Ask the user to check the rendered panel.",
          );
        }

        return textResult(
          "Export error: renderer.ts must export `render()` or `mount()` (named or default).",
        );
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return textResult(
          `Runtime error:\n${err.message}${err.stack ? "\n" + err.stack : ""}`,
        );
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    },
  };
}
