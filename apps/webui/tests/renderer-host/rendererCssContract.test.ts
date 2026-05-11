import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function walkRendererFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkRendererFiles(path, out);
    } else if (
      path.includes(`${join("renderer", "")}`) &&
      (path.endsWith(".css") || path.endsWith(".tsx") || path.endsWith(".ts"))
    ) {
      out.push(path);
    }
  }
  return out;
}

describe("built-in Renderer CSS variable contract", () => {
  test("does not use Web UI internal --color-* variables", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const root = join(repoRoot, "example_data", "library", "templates");
    const offenders = walkRendererFiles(root)
      .map((path) => ({
        path: relative(repoRoot, path),
        hasColorVar: readFileSync(path, "utf8").includes("--color-"),
      }))
      .filter((file) => file.hasColorVar)
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  test("only aliases host defaults inside a renderer-owned schema block", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const root = join(repoRoot, "example_data", "library", "templates");
    const offenders = walkRendererFiles(root)
      .map((path) => ({
        path: relative(repoRoot, path),
        content: readFileSync(path, "utf8"),
      }))
      .filter((file) =>
        [...file.content.matchAll(/:root\s*\{[^}]*\}/g)].some((block) => {
          const css = block[0];
          const aliasesHostDefault =
            /--agentchan-renderer-[a-z0-9-]+:\s*var\(--agentchan-default-[a-z0-9-]+\)/.test(css);
          const declaresOwnedSchema =
            /--agentchan-renderer-[a-z0-9-]+:\s*(?!var\(--agentchan-default-[a-z0-9-]+\))/.test(css);
          return aliasesHostDefault && !declaresOwnedSchema;
        }),
      )
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  test("does not alias renderer-owned color variables to host defaults", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const root = join(repoRoot, "example_data", "library", "templates");
    const offenders = walkRendererFiles(root)
      .map((path) => ({
        path: relative(repoRoot, path),
        aliasesColor: /--agentchan-renderer-(?!font-)[a-z0-9-]+:\s*var\(--agentchan-default-[a-z0-9-]+\)/.test(
          readFileSync(path, "utf8"),
        ),
      }))
      .filter((file) => file.aliasesColor)
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  test("does not self-reference renderer-owned variables", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const root = join(repoRoot, "example_data", "library", "templates");
    const offenders = walkRendererFiles(root)
      .map((path) => ({
        path: relative(repoRoot, path),
        selfReferences: /--(agentchan-renderer-[a-z0-9-]+):\s*var\(--\1\)/.test(readFileSync(path, "utf8")),
      }))
      .filter((file) => file.selfReferences)
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  test("declares every renderer-owned variable it uses", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const root = join(repoRoot, "example_data", "library", "templates");
    const byRenderer = new Map<string, { declared: Set<string>; used: Set<string> }>();

    for (const path of walkRendererFiles(root)) {
      const rendererDir = path.slice(0, path.indexOf(`${join("renderer", "")}`) + "renderer".length);
      const entry = byRenderer.get(rendererDir) ?? { declared: new Set<string>(), used: new Set<string>() };
      const content = readFileSync(path, "utf8");
      for (const match of content.matchAll(/--(agentchan-renderer-[a-z0-9-]+)\s*:/g)) {
        entry.declared.add(match[1]);
      }
      for (const match of content.matchAll(/var\(--(agentchan-renderer-[a-z0-9-]+)(?:[,)]|\s)/g)) {
        entry.used.add(match[1]);
      }
      byRenderer.set(rendererDir, entry);
    }

    const offenders = [...byRenderer.entries()]
      .map(([path, entry]) => {
        const missing = [...entry.used].filter((name) => !entry.declared.has(name));
        return {
          path: relative(repoRoot, path),
          missing,
        };
      })
      .filter((renderer) => renderer.missing.length > 0)
      .map((renderer) => `${renderer.path}: ${renderer.missing.join(", ")}`);

    expect(offenders).toEqual([]);
  });
});
