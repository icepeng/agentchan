import { join } from "node:path";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer.ts by transpiling and evaluating it.

Checks that the file transpiles and exports a mount-contract default. Runtime HTML preview is not possible without a browser DOM; ask the user to verify the rendered panel visually.
Use this after writing or editing renderer.ts to catch transpile/export errors before asking the user to check.`;

interface RendererModule {
  default?: { mount?: unknown };
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

      const runtime = await import(/* @vite-ignore */ "@agentchan/renderer-runtime" as string);
      (globalThis as unknown as { __rendererRuntime: unknown }).__rendererRuntime = runtime;

      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, rewritten);
      try {
        const mod = (await import(tmpPath)) as RendererModule;

        // `defineRenderer(...)` exposes `{ mount, theme? }`. We can't invoke
        // mount without a DOM, so runtime preview is skipped — the transpile
        // + export check above is still a useful early signal.
        if (typeof mod.default?.mount !== "function") {
          return textResult(
            "Export error: renderer.ts must `export default defineRenderer(render, { theme? })`.",
          );
        }

        return textResult(
          "OK — mount-contract export detected. Runtime HTML preview skipped (mount requires a browser DOM). Ask the user to check the rendered panel.",
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
