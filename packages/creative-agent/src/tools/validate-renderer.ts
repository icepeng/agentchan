import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { buildRenderer } from "@agentchan/renderer-bundle";
import { textResult } from "../tool-result.js";
import { scanWorkspaceFiles } from "../workspace/scan.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer by bundling and executing it with the current project files.

Supports flat renderer.ts or a renderer/ directory with relative imports.
Returns rendered HTML on success, or a detailed error message with the failure phase (transpile / export / runtime).
Use this after writing or editing the renderer to verify it works before asking the user to check.`;

const MAX_HTML_CHARS = 3000;

export interface CreateValidateRendererToolOptions {
  /** Absolute path to @agentchan/renderer-runtime's source entry. */
  runtimeEntry: string;
}

export function createValidateRendererTool(
  projectDir: string,
  opts: CreateValidateRendererToolOptions,
): AgentTool<typeof ValidateRendererParams, void> {
  return {
    name: "validate-renderer",
    description: DESCRIPTION,
    parameters: ValidateRendererParams,
    label: "Validate renderer",

    async execute(): Promise<AgentToolResult<void>> {
      const built = await buildRenderer(projectDir, {
        runtimeEntry: opts.runtimeEntry,
      });
      if ("error" in built) return textResult(built.error);

      const files = await scanWorkspaceFiles(join(projectDir, "files"));

      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, built.js);
      try {
        const mod = await import(tmpPath);

        if (typeof mod.render !== "function") {
          return textResult(
            "Export error: renderer does not export a render() function.",
          );
        }

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
