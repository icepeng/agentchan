import { join } from "node:path";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer/index.ts by transpiling and checking it exports mount().

Reports the failure phase (read / transpile / export) with a detailed message.
Runtime execution requires a DOM (iframe) so actual rendering is verified by the user in the UI — this tool catches syntax and contract errors only.
Use this after writing or editing renderer/index.ts.`;

export function createValidateRendererTool(
  projectDir: string,
): AgentTool<typeof ValidateRendererParams, void> {
  return {
    name: "validate-renderer",
    description: DESCRIPTION,
    parameters: ValidateRendererParams,
    label: "Validate renderer",

    async execute(): Promise<AgentToolResult<void>> {
      const rendererPath = join(projectDir, "renderer", "index.ts");
      let source: string;
      try {
        source = await readFile(rendererPath, "utf-8");
      } catch {
        return textResult("Error: renderer/index.ts not found in project root.");
      }

      const transpiler = new Bun.Transpiler({ loader: "ts" });
      let js: string;
      try {
        js = transpiler.transformSync(source);
      } catch (e) {
        return textResult(
          `Transpile error:\n${e instanceof Error ? e.message : String(e)}`,
        );
      }

      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, js);
      try {
        const mod = await import(tmpPath);
        if (typeof mod.mount !== "function") {
          return textResult(
            "Export error: renderer/index.ts must export a `mount(container, ctx)` function.",
          );
        }
      } catch (e) {
        return textResult(
          `Export error: module failed to import — ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        await unlink(tmpPath).catch(() => {});
      }

      return textResult(
        "OK — transpile succeeded and `mount` is exported. Runtime behaviour (render output, scroll, actions, theme) requires a DOM; verify in the UI.",
      );
    },
  };
}
