import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHostShellService } from "../../src/server/services/host-shell.service.js";

function parseDeclarations(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const match of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim();
  }
  return vars;
}

function readBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing CSS block: ${selector}`);
  return match[1];
}

function toWebUiToken(hostToken: string): string {
  const name = hostToken.replace("--agentchan-default-", "");
  if (name.startsWith("font-")) {
    return `--font-family-${name.replace("font-", "")}`;
  }
  return `--color-${name}`;
}

describe("default theme token parity", () => {
  test("host fallback tokens match Web UI CSS tokens", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const mainCss = readFileSync(join(repoRoot, "apps/webui/src/client/main.css"), "utf8");
    const hostCss = createHostShellService({ isDev: true }).hostThemeCss().css;

    const webDefaults = parseDeclarations(readBlock(mainCss, "@theme"));
    const webLightOverrides = parseDeclarations(readBlock(mainCss, '[data-theme="light"]'));
    const webDark = webDefaults;
    const webLight = { ...webDefaults, ...webLightOverrides };

    const hostDark = parseDeclarations(readBlock(hostCss, '[data-theme="dark"]'));
    const hostLight = parseDeclarations(readBlock(hostCss, '[data-theme="light"]'));

    const mismatches = [
      ...compareTokens("dark", hostDark, webDark),
      ...compareTokens("light", hostLight, webLight),
    ];

    expect(mismatches).toEqual([]);
  });
});

function compareTokens(
  scheme: "dark" | "light",
  hostTokens: Record<string, string>,
  webTokens: Record<string, string>,
): string[] {
  return Object.entries(hostTokens)
    .map(([hostToken, hostValue]) => {
      const webToken = toWebUiToken(hostToken);
      const webValue = webTokens[webToken];
      if (webValue === hostValue) return null;
      return `${scheme}: ${hostToken}=${hostValue} != ${webToken}=${webValue ?? "<missing>"}`;
    })
    .filter((message): message is string => message !== null);
}
