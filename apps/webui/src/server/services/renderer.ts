import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROJECTS_DIR } from "../paths.js";

const transpiler = new Bun.Transpiler({ loader: "ts" });

/**
 * Transpile renderer.ts to JavaScript ES module.
 * The client will execute it via Blob URL dynamic import.
 */
export async function transpileRenderer(slug: string): Promise<string | null> {
  const rendererPath = join(PROJECTS_DIR, slug, "renderer.ts");
  if (!existsSync(rendererPath)) return null;

  const source = await Bun.file(rendererPath).text();
  return transpiler.transformSync(source);
}

export async function readRendererSource(slug: string): Promise<string | null> {
  const rendererPath = join(PROJECTS_DIR, slug, "renderer.ts");
  if (!existsSync(rendererPath)) return null;
  return Bun.file(rendererPath).text();
}

export async function writeRendererSource(slug: string, source: string): Promise<void> {
  const rendererPath = join(PROJECTS_DIR, slug, "renderer.ts");
  await Bun.write(rendererPath, source);
}
