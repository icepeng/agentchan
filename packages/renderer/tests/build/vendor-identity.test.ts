import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildVendorFixtures,
  type VendorBuildResult,
  type VendorFixtureBuildResult,
} from "@agentchan/renderer-vendor";
import {
  buildRendererBundle,
  EXTERNAL_VENDOR_SPECIFIERS,
} from "../../src/build/index.ts";

let projectDir: string;
let vendorDir: string;
let vendor: VendorBuildResult;

beforeAll(async () => {
  // Vendor build is the expensive setup (~five Bun.builds across react/etc).
  // Build once and share across cases — the suite only needs one fixture set.
  vendorDir = await mkdtemp(join(tmpdir(), "renderer-identity-vendor-"));
  vendor = await buildVendorFixtures({ outDir: vendorDir, mode: "development" });
});

afterAll(async () => {
  await rm(vendorDir, { recursive: true, force: true });
});

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "renderer-identity-"));
  await mkdir(join(projectDir, "renderer"), { recursive: true });
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function writeRenderer(path: string, content: string): Promise<void> {
  await writeFile(join(projectDir, "renderer", path), content, "utf-8");
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites the renderer bundle's external bare specifiers to file URLs that point
 * at the just-built vendor fixtures. This stands in for the host document
 * importmap: the production browser does this lookup at module-evaluation time,
 * the test does it on disk so that Bun's `import()` can resolve the same files.
 */
function rewriteWithVendorMap(
  js: string,
  fixtures: readonly VendorFixtureBuildResult[],
): string {
  let rewritten = js;
  for (const fx of fixtures) {
    const fileUrl = pathToFileURL(fx.outPath).href;
    rewritten = rewritten.replace(
      new RegExp(`(from\\s*)(["'])${escapeRegExp(fx.specifier)}\\2`, "g"),
      `$1"${fileUrl}"`,
    );
  }
  return rewritten;
}

async function importBundle(js: string): Promise<Record<string, unknown>> {
  const tmpPath = join(tmpdir(), `renderer-bundle-${crypto.randomUUID()}.mjs`);
  await writeFile(tmpPath, js, "utf-8");
  try {
    return (await import(pathToFileURL(tmpPath).href)) as Record<string, unknown>;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

describe("Renderer + vendor module identity", () => {
  test("renderer bundle and host share the same React instance via importmap", async () => {
    const reactFx = vendor.fixtures.find((fx) => fx.specifier === "react");
    const reactDomFx = vendor.fixtures.find((fx) => fx.specifier === "react-dom/client");
    const schedulerFx = vendor.fixtures.find((fx) => fx.specifier === "scheduler");
    expect(reactFx).toBeDefined();
    expect(reactDomFx).toBeDefined();
    expect(schedulerFx).toBeDefined();

    await writeRenderer(
      "index.tsx",
      `
        import { createElement, useState, Fragment } from "react";
        import { createRoot } from "react-dom/client";
        import { unstable_now } from "scheduler";
        import { defineRenderer } from "@agentchan/renderer/core";

        export const reactRefs = { createElement, useState, Fragment };
        export const reactDomRefs = { createRoot };
        export const schedulerRefs = { unstable_now };

        export const renderer = defineRenderer(({ container }) => {
          container.textContent = "";
          return { update() {}, unmount() {} };
        });
      `,
    );

    const bundle = await buildRendererBundle(projectDir);
    const rewritten = rewriteWithVendorMap(bundle?.js ?? "", vendor.fixtures);

    // The blob URL renderer (rewritten bundle) and the host (direct fixture import)
    // must observe the same module identity for every named React export.
    const rendererMod = await importBundle(rewritten);
    const hostReact = (await import(pathToFileURL(reactFx!.outPath).href)) as Record<
      string,
      unknown
    >;
    const hostReactDom = (await import(pathToFileURL(reactDomFx!.outPath).href)) as Record<
      string,
      unknown
    >;
    const hostScheduler = (await import(pathToFileURL(schedulerFx!.outPath).href)) as Record<
      string,
      unknown
    >;

    const reactRefs = rendererMod.reactRefs as Record<string, unknown>;
    expect(reactRefs.createElement).toBe(hostReact.createElement);
    expect(reactRefs.useState).toBe(hostReact.useState);
    expect(reactRefs.Fragment).toBe(hostReact.Fragment);

    const reactDomRefs = rendererMod.reactDomRefs as Record<string, unknown>;
    expect(reactDomRefs.createRoot).toBe(hostReactDom.createRoot);

    const schedulerRefs = rendererMod.schedulerRefs as Record<string, unknown>;
    expect(schedulerRefs.unstable_now).toBe(hostScheduler.unstable_now);
  });

  test("vendor builder emits a fixture for every external renderer specifier", () => {
    const fixtureSpecifiers = new Set(vendor.fixtures.map((fx) => fx.specifier));
    for (const specifier of EXTERNAL_VENDOR_SPECIFIERS) {
      expect(fixtureSpecifiers.has(specifier)).toBe(true);
    }
  });
});
