import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const clientRoot = join(import.meta.dir, "../../src/client");

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

describe("client update slice", () => {
  test("exposes update through one slice barrel without legacy imports", async () => {
    const updateIndex = join(clientRoot, "update/index.ts");

    expect(await exists(updateIndex)).toBe(true);
    expect(await exists(join(clientRoot, "features/update"))).toBe(false);
    expect(await exists(join(clientRoot, "entities/update"))).toBe(false);

    const updateBarrel = await readFile(updateIndex, "utf8");

    expect(updateBarrel).toContain('export { UpdateBanner } from "./UpdateBanner.js";');
    expect(updateBarrel).toContain('export { AboutSection } from "./AboutSection.js";');
    expect(updateBarrel).toContain('export { useVersion } from "./useVersion.js";');

    const legacyImportPattern =
      /["']@\/client\/(?:features|entities)\/update\//;
    const deepUpdateImportPattern =
      /["']@\/client\/update\/(?!index\.js["'])/;
    const offenders: string[] = [];

    for (const file of await sourceFiles(clientRoot)) {
      const content = await readFile(file, "utf8");
      if (legacyImportPattern.test(content) || deepUpdateImportPattern.test(content)) {
        offenders.push(relative(clientRoot, file).split(sep).join("/"));
      }
    }

    expect(offenders).toEqual([]);
  });
});
