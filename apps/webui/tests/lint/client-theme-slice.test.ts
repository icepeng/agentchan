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

describe("client theme slice", () => {
  test("exposes theme through one slice barrel without legacy imports", async () => {
    const themeIndex = join(clientRoot, "theme/index.ts");

    expect(await exists(themeIndex)).toBe(true);
    expect(await exists(join(clientRoot, "features/settings/useTheme.ts"))).toBe(false);
    expect(await exists(join(clientRoot, "features/settings/AppearanceTab.tsx"))).toBe(false);

    const themeBarrel = await readFile(themeIndex, "utf8");

    expect(themeBarrel).toContain('export { AppearanceTab } from "./AppearanceTab.js";');
    expect(themeBarrel).toContain("ThemeProvider");
    expect(themeBarrel).toContain("useTheme");

    const legacyImportPattern =
      /["']@\/client\/features\/settings\/(?:useTheme|AppearanceTab)/;
    const deepThemeImportPattern =
      /["']@\/client\/theme\/(?!index\.js["'])/;
    const forbiddenThemeDependencyPattern =
      /["']@\/client\/(?:features\/settings|update)\//;
    const offenders: string[] = [];
    const themeDependencyOffenders: string[] = [];

    for (const file of await sourceFiles(clientRoot)) {
      const content = await readFile(file, "utf8");
      const clientRelativePath = relative(clientRoot, file).split(sep).join("/");
      if (legacyImportPattern.test(content) || deepThemeImportPattern.test(content)) {
        offenders.push(clientRelativePath);
      }
      if (
        clientRelativePath.split("/")[0] === "theme" &&
        forbiddenThemeDependencyPattern.test(content)
      ) {
        themeDependencyOffenders.push(clientRelativePath);
      }
    }

    expect(offenders).toEqual([]);
    expect(themeDependencyOffenders).toEqual([]);
  });
});
