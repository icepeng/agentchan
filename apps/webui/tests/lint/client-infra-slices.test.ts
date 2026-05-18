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

describe("client infra slices", () => {
  test("exposes design-system and platform barrels without legacy imports", async () => {
    const designSystemIndex = join(clientRoot, "design-system/index.ts");
    const platformIndex = join(clientRoot, "platform/index.ts");

    expect(await exists(designSystemIndex)).toBe(true);
    expect(await exists(platformIndex)).toBe(true);
    expect(await exists(join(clientRoot, "shared"))).toBe(false);
    expect(await exists(join(clientRoot, "shared/blockMarkdown.tsx"))).toBe(false);

    const designSystemBarrel = await readFile(designSystemIndex, "utf8");
    const platformBarrel = await readFile(platformIndex, "utf8");

    for (const primitive of [
      "Button",
      "Dialog",
      "IconButton",
      "ScrollArea",
      "ResizeHandle",
      "EditModeToggle",
    ]) {
      expect(designSystemBarrel).toContain(`./${primitive}.js`);
    }

    for (const infra of [
      "./api.js",
      "./swr.js",
      "./storage.js",
      "./queryKeys.js",
      "./notifications.js",
      "./ErrorBoundary.js",
      "./i18n/index.js",
    ]) {
      expect(platformBarrel).toContain(infra);
    }

    const legacyImportPattern =
      /["']@\/client\/(?:shared\/ui|entities\/ui|i18n)\//;
    const offenders: string[] = [];

    for (const file of await sourceFiles(clientRoot)) {
      const content = await readFile(file, "utf8");
      if (legacyImportPattern.test(content)) {
        offenders.push(relative(clientRoot, file).split(sep).join("/"));
      }
    }

    expect(offenders).toEqual([]);
  });
});
