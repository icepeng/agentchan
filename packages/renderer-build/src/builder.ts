import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RendererBundle } from "@agentchan/renderer/core";
import { RendererBuildError } from "./errors.js";
import { validateRendererImportPolicy } from "./policy.js";
import {
  createRendererRuntimePlugin,
  createRendererSourcePlugin,
} from "./plugins/index.js";

export function findRendererEntrypoint(projectDir: string): string | null {
  const tsEntry = join(projectDir, "renderer", "index.ts");
  const tsxEntry = join(projectDir, "renderer", "index.tsx");
  const hasTs = existsSync(tsEntry);
  const hasTsx = existsSync(tsxEntry);

  if (hasTs && hasTsx) {
    throw new RendererBuildError(
      "Renderer must have a single entrypoint: use either renderer/index.ts or renderer/index.tsx, not both.",
      "entrypoint",
    );
  }

  if (hasTsx) return tsxEntry;
  if (hasTs) return tsEntry;
  return null;
}

export async function buildRendererBundle(projectDir: string): Promise<RendererBundle | null> {
  const entrypoint = findRendererEntrypoint(projectDir);
  if (!entrypoint) return null;

  const rendererDir = join(projectDir, "renderer");
  await validateRendererImportPolicy(entrypoint, rendererDir);

  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    plugins: [createRendererSourcePlugin(rendererDir), createRendererRuntimePlugin()],
  });

  if (!result.success) {
    const message = result.logs.map((log) => log.message).join("\n").trim();
    throw new RendererBuildError(message || "Renderer build failed.");
  }

  const js: string[] = [];
  const css: string[] = [];
  await Promise.all(result.outputs.map(async (output) => {
    if (output.type.startsWith("text/javascript")) {
      js.push(await output.text());
    } else if (output.type === "text/css;charset=utf-8" || output.path.endsWith(".css")) {
      css.push(await output.text());
    }
  }));

  if (js.length !== 1) {
    throw new RendererBuildError("Renderer build did not produce one JavaScript entrypoint.");
  }

  return { js: js[0] ?? "", css };
}
