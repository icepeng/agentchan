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

export function createValidateRendererTool(
  projectDir: string,
): AgentTool<typeof ValidateRendererParams, void> {
  return {
    name: "validate-renderer",
    description: DESCRIPTION,
    parameters: ValidateRendererParams,
    label: "Validate renderer",

    async execute(
      _toolCallId: string,
    ): Promise<AgentToolResult<void>> {
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

      // 4. Write to temp file and dynamic import
      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, js);
      try {
        const mod = await import(tmpPath);

        if (typeof mod.render !== "function") {
          return textResult(
            "Export error: renderer.ts does not export a render() function.",
          );
        }

        // 5. Execute render()
        const ctx = { files, baseUrl: "/api/projects/_validate" };
        const html: string = mod.render(ctx);

        const preview =
          html.length > MAX_HTML_CHARS
            ? html.slice(0, MAX_HTML_CHARS) + `\n...(truncated, ${html.length} chars total)`
            : html;

        return textResult(`OK — rendered ${html.length} chars.\n\n${preview}`);
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
