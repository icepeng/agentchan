import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const repoRoot = join(import.meta.dir, "../../../..");
const clientRoot = join(repoRoot, "apps/webui/src/client");

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

describe("provider slice", () => {
  test("exposes the provider public surface from client/provider", () => {
    const indexPath = join(clientRoot, "provider/index.ts");
    const source = readFileSync(indexPath, "utf8");

    for (const symbol of [
      "ModelBar",
      "OAuthProviderCard",
      "ApiKeysTab",
      "useActiveModel",
      "useProviders",
      "useApiKeys",
      "useOauthStatus",
      "useProviderMutations",
      "resolveContextWindow",
      "ProviderInfo",
      "ModelInfo",
      "ThinkingLevel",
      "CustomProviderDef",
      "CustomApiFormat",
      "ApiKeyStatus",
      "OAuthStatus",
    ]) {
      expect(source).toContain(symbol);
    }
    expect(source).not.toContain("DEFAULT_CONTEXT_WINDOW");
    expect(source).not.toContain("DEFAULT_MAX_TOKENS");
  });

  test("removes legacy provider folders", () => {
    expect(existsSync(join(clientRoot, "entities/config"))).toBe(false);
    expect(existsSync(join(clientRoot, "features/oauth"))).toBe(false);
  });

  test("does not import provider code through legacy paths", async () => {
    const legacyImportPattern =
      /["']@\/client\/(?:entities\/config|features\/oauth|features\/settings\/(?:ApiKeysTab|ModelBar|ProviderForm)|shared\/useClipboard)/;
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
