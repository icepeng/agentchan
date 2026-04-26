import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { nanoid } from "nanoid";
import {
  buildRendererBundle,
  findRendererEntrypoint,
  RendererV1Error,
  validateRendererTheme,
} from "../renderer/index.js";
import { textResult } from "../tool-result.js";
import { scanWorkspaceFiles } from "../workspace/scan.js";

const ValidateRendererParams = Type.Object({});

const DESCRIPTION = `Validate the project's renderer/ entrypoint by bundling it and checking the Renderer V1 contract.

Returns a success message with bundle details, or a detailed error message with the failure phase (entrypoint / policy / build / export / runtime / theme).
Use this after writing or editing renderer/index.ts or renderer/index.tsx to verify it works before asking the user to check.`;

interface RendererSnapshot {
  slug: string;
  files: Awaited<ReturnType<typeof scanWorkspaceFiles>>;
  baseUrl: string;
  state: { messages: unknown[]; isStreaming: boolean; pendingToolCalls: readonly string[] };
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
      try {
        const entrypoint = findRendererEntrypoint(projectDir);
        if (!entrypoint) {
          return textResult("Entrypoint error:\nrenderer/index.ts or renderer/index.tsx not found.");
        }
      } catch (e) {
        return textResult(formatRendererError(e));
      }

      let bundle: Awaited<ReturnType<typeof buildRendererBundle>>;
      try {
        bundle = await buildRendererBundle(projectDir);
      } catch (e) {
        return textResult(formatRendererError(e));
      }
      if (!bundle) {
        return textResult("Entrypoint error:\nrenderer/index.ts or renderer/index.tsx not found.");
      }

      const tmpPath = join(tmpdir(), `agentchan-renderer-${nanoid(8)}.mjs`);
      await writeFile(tmpPath, bundle.js);

      try {
        const mod = await import(pathToFileURL(tmpPath).href) as { renderer?: unknown };

        if (!isRendererRuntime(mod.renderer)) {
          return textResult(
            "Export error: renderer export must provide mount(container, bridge).",
          );
        }

        const files = typeof mod.renderer.theme === "function"
          ? await scanWorkspaceFiles(join(projectDir, "files"))
          : [];
        const snapshot: RendererSnapshot = {
          slug: "_validate",
          files,
          baseUrl: "/api/projects/_validate",
          state: { messages: [], isStreaming: false, pendingToolCalls: [] },
        };

        const normalizedTheme =
          typeof mod.renderer.theme === "function"
            ? validateRendererTheme(mod.renderer.theme(snapshot))
            : null;
        const themeSummary = normalizedTheme
          ? ` Theme tokens: ${Object.keys(normalizedTheme.base).length}.`
          : "";
        const filesSummary = typeof mod.renderer.theme === "function"
          ? ` Files: ${files.length}.`
          : "";

        return textResult(
          `OK - Renderer V1 contract is valid. JS bundle: ${bundle.js.length} chars. CSS artifacts: ${bundle.css.length}.${filesSummary}${themeSummary}`,
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

function formatRendererError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof RendererV1Error) {
    return `${capitalize(e.phase)} error:\n${message}`;
  }
  return `Build error:\n${message}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Mirrors @agentchan/renderer/core isRendererRuntime without importing package source
// across the creative-agent TS rootDir boundary.
function isRendererRuntime(value: unknown): value is {
  mount: (...args: unknown[]) => unknown;
  theme?: (snapshot: RendererSnapshot) => unknown;
} {
  if (typeof value !== "object" || value === null) return false;
  const runtime = value as { mount?: unknown; theme?: unknown };
  return typeof runtime.mount === "function" &&
    (runtime.theme === undefined || typeof runtime.theme === "function");
}
