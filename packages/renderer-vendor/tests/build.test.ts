import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildVendorFixtures,
  VENDOR_SPECIFIERS,
} from "../src/build.ts";

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "renderer-vendor-test-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

async function importFixture(path: string): Promise<Record<string, unknown>> {
  const url = `${pathToFileURL(path).href}?v=${crypto.randomUUID()}`;
  return (await import(url)) as Record<string, unknown>;
}

/**
 * Stand-in for the host document importmap when importing a fixture that
 * externalizes peer specifiers. Rewrites bare `import ... from "react"`
 * (etc.) to file:// URLs of sibling fixtures inside the same outDir, then
 * stages the result in the outDir itself so the original module's relative
 * resolution still works.
 */
async function importFixtureViaImportmap(
  result: { fixtures: { specifier: string; filename: string; outPath: string }[]; outDir: string },
  specifier: string,
): Promise<Record<string, unknown>> {
  const fx = result.fixtures.find((f) => f.specifier === specifier);
  if (!fx) throw new Error(`fixture for ${specifier} not built`);
  let source = await Bun.file(fx.outPath).text();
  for (const peer of result.fixtures) {
    if (peer.specifier === specifier) continue;
    const peerUrl = pathToFileURL(peer.outPath).href;
    source = source.replace(
      new RegExp(`(from\\s*)(["'])${peer.specifier.replace(/[.*+?^${}()|[\\\]]/g, "\\$&")}\\2`, "g"),
      `$1"${peerUrl}"`,
    );
  }
  const stagedPath = join(result.outDir, `__import-${crypto.randomUUID()}.mjs`);
  await Bun.write(stagedPath, source);
  return (await import(`${pathToFileURL(stagedPath).href}`)) as Record<string, unknown>;
}

describe("buildVendorFixtures", () => {
  test("emits one fixture per baseline specifier", async () => {
    const result = await buildVendorFixtures({ outDir, mode: "development" });
    expect(result.fixtures.map((fx) => fx.specifier)).toEqual(
      VENDOR_SPECIFIERS.map((s) => s.specifier),
    );
    for (const fx of result.fixtures) {
      expect(await Bun.file(fx.outPath).exists()).toBe(true);
    }
  });

  test("react fixture exposes core named exports as ESM bindings", async () => {
    const result = await buildVendorFixtures({ outDir, mode: "development" });
    const reactFx = result.fixtures.find((fx) => fx.specifier === "react");
    expect(reactFx).toBeDefined();
    const mod = await importFixture(reactFx!.outPath);
    expect(typeof mod.createElement).toBe("function");
    expect(typeof mod.useState).toBe("function");
    expect(typeof mod.Fragment).not.toBe("undefined");
    expect(mod.default).toBeDefined();
    expect((mod.default as { createElement: unknown }).createElement).toBe(
      mod.createElement,
    );
  });

  test("react-dom/client fixture exposes createRoot named export", async () => {
    const result = await buildVendorFixtures({ outDir, mode: "development" });
    const mod = await importFixtureViaImportmap(result, "react-dom/client");
    expect(typeof mod.createRoot).toBe("function");
  });

  test("scheduler fixture exposes unstable_now named export", async () => {
    const result = await buildVendorFixtures({ outDir, mode: "development" });
    const fx = result.fixtures.find((f) => f.specifier === "scheduler");
    const mod = await importFixture(fx!.outPath);
    expect(typeof mod.unstable_now).toBe("function");
  });

  test("development fixture replaces NODE_ENV with 'development'", async () => {
    const result = await buildVendorFixtures({ outDir, mode: "development" });
    const reactFx = result.fixtures.find((fx) => fx.specifier === "react");
    const source = await Bun.file(reactFx!.outPath).text();
    // Bun's CJS->ESM output guards prod/dev branches with `if (false)` after the define is
    // applied. The dev branch (`require_react_development`) must still be present.
    expect(source).toContain("require_react_development");
  });

  test("production fixture inlines 'production' for NODE_ENV", async () => {
    const result = await buildVendorFixtures({ outDir, mode: "production" });
    const reactFx = result.fixtures.find((fx) => fx.specifier === "react");
    const source = await Bun.file(reactFx!.outPath).text();
    expect(source).toContain("require_react_production");
  });

  test("repeat imports of the same fixture URL share React identity", async () => {
    const result = await buildVendorFixtures({ outDir, mode: "development" });
    const reactFx = result.fixtures.find((fx) => fx.specifier === "react");
    const url = pathToFileURL(reactFx!.outPath).href;
    const first = (await import(url)) as { createElement: unknown };
    const second = (await import(url)) as { createElement: unknown };
    expect(first.createElement).toBe(second.createElement);
    expect(first).toBe(second);
  });

  // Regression: peer fixtures must externalize the React baseline instead of
  // inlining their own copy. Otherwise react-dom-client's bundled React holds
  // a separate ReactSharedInternals — useState in the renderer reads a
  // dispatcher set by a different React instance and throws "Invalid hook
  // call" on first render. The Bun output ships a `var require_react_development`
  // commonJS shim only when react/cjs/react.development.js is part of the
  // bundle graph, so its absence proves the externalization held.
  describe("peer externalization", () => {
    const PEER_DEPENDENT_SPECIFIERS = [
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ] as const;

    for (const specifier of PEER_DEPENDENT_SPECIFIERS) {
      test(`${specifier} fixture imports react externally and does not inline it`, async () => {
        const result = await buildVendorFixtures({ outDir, mode: "development" });
        const fx = result.fixtures.find((f) => f.specifier === specifier);
        expect(fx).toBeDefined();
        const source = await Bun.file(fx!.outPath).text();
        expect(source).not.toContain("require_react_development");
        expect(source).toMatch(/import\s+[^;]+from\s+["']react["']/);
      });
    }

    test("react-dom/client fixture also externalizes scheduler", async () => {
      const result = await buildVendorFixtures({ outDir, mode: "development" });
      const fx = result.fixtures.find((f) => f.specifier === "react-dom/client");
      const source = await Bun.file(fx!.outPath).text();
      expect(source).not.toContain("require_scheduler_development");
      expect(source).toMatch(/import\s+[^;]+from\s+["']scheduler["']/);
    });

    test("react fixture remains self-contained (leaf of the dependency graph)", async () => {
      const result = await buildVendorFixtures({ outDir, mode: "development" });
      const fx = result.fixtures.find((f) => f.specifier === "react");
      const source = await Bun.file(fx!.outPath).text();
      // react.js still inlines its own implementation — it is the leaf that
      // every peer points to via importmap.
      expect(source).toContain("require_react_development");
    });
  });
});
