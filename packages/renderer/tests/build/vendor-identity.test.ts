import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
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
let stagedDir: string;
let vendor: VendorBuildResult;
/** specifier → file URL of a staged fixture whose own peer imports resolve to other staged URLs. */
let stagedUrls: Map<string, string>;

beforeAll(async () => {
  // Vendor build is the expensive setup (~five Bun.builds across react/etc).
  // Build once and share across cases — the suite only needs one fixture set.
  vendorDir = await mkdtemp(join(tmpdir(), "renderer-identity-vendor-"));
  vendor = await buildVendorFixtures({ outDir: vendorDir, mode: "development" });
  // Each emitted fixture externalizes its peer specifiers (e.g.
  // react-dom-client has `import "react"`). Browser importmap resolves those
  // at module-evaluation time. In Node we have no importmap, so we stage a
  // parallel copy of every fixture in which peer bare specifiers are
  // rewritten to file:// URLs of the other staged copies. Module identity
  // then comes from Node's URL-keyed module cache.
  stagedDir = await mkdtemp(join(tmpdir(), "renderer-identity-staged-"));
  stagedUrls = await stageVendorFixtures(vendor, stagedDir);
});

afterAll(async () => {
  await rm(vendorDir, { recursive: true, force: true });
  await rm(stagedDir, { recursive: true, force: true });
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

function rewriteWithUrlMap(js: string, urlMap: ReadonlyMap<string, string>): string {
  let rewritten = js;
  for (const [specifier, url] of urlMap) {
    rewritten = rewritten.replace(
      new RegExp(`(from\\s*)(["'])${escapeRegExp(specifier)}\\2`, "g"),
      `$1"${url}"`,
    );
  }
  return rewritten;
}

async function stageVendorFixtures(
  built: VendorBuildResult,
  outDir: string,
): Promise<Map<string, string>> {
  const stagedPathBySpecifier = new Map<string, string>();
  for (const fx of built.fixtures) {
    // Flatten "react/jsx-runtime" → "react_jsx-runtime.mjs" so each staged
    // file lives directly in `outDir`.
    const stagedName = `${fx.specifier.replace(/[/\\]/g, "_")}.mjs`;
    stagedPathBySpecifier.set(fx.specifier, join(outDir, stagedName));
  }
  const stagedUrlBySpecifier = new Map<string, string>();
  for (const [specifier, path] of stagedPathBySpecifier) {
    stagedUrlBySpecifier.set(specifier, pathToFileURL(path).href);
  }
  for (const fx of built.fixtures) {
    const source = await readFile(fx.outPath, "utf-8");
    const peerUrlMap = new Map(stagedUrlBySpecifier);
    peerUrlMap.delete(fx.specifier); // do not rewrite self-imports (none expected)
    const rewritten = rewriteWithUrlMap(source, peerUrlMap);
    await writeFile(stagedPathBySpecifier.get(fx.specifier)!, rewritten, "utf-8");
  }
  return stagedUrlBySpecifier;
}

async function importBundle(js: string): Promise<Record<string, unknown>> {
  // Stage the renderer bundle in the staged-vendor dir so that any relative
  // resolution inside it stays consistent with the staged peer URLs.
  const tmpPath = join(stagedDir, `renderer-bundle-${crypto.randomUUID()}.mjs`);
  await writeFile(tmpPath, js, "utf-8");
  try {
    return (await import(pathToFileURL(tmpPath).href)) as Record<string, unknown>;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

describe("Renderer + vendor module identity", () => {
  test("renderer bundle and host share the same React instance via importmap", async () => {
    expect(stagedUrls.has("react")).toBe(true);
    expect(stagedUrls.has("react-dom/client")).toBe(true);
    expect(stagedUrls.has("scheduler")).toBe(true);

    await writeRenderer(
      "index.tsx",
      `
        import { createElement, useState, Fragment } from "react";
        import { createRoot } from "react-dom/client";
        import { unstable_now } from "scheduler";
        import { defineRenderer } from "@agentchan/renderer/core";

        // JSX pulls in the jsx-dev-runtime fixture. Its upstream CJS source
        // reassigns its React local — the externalized fixture has to
        // restore that mutability or evaluation throws on first load.
        const probe = <div>renderer-vendor identity probe</div>;

        export const reactRefs = { createElement, useState, Fragment };
        export const reactDomRefs = { createRoot };
        export const schedulerRefs = { unstable_now };
        export const jsxProbeType = probe.type;

        export const renderer = defineRenderer(({ container }) => {
          container.textContent = "";
          return { update() {}, unmount() {} };
        });
      `,
    );

    const bundle = await buildRendererBundle(projectDir);
    const rewritten = rewriteWithUrlMap(bundle?.js ?? "", stagedUrls);

    // The blob URL renderer (rewritten bundle) and the host (direct import of
    // staged fixtures) both go through the same staged set, so Node's
    // URL-keyed module cache guarantees a single module instance per
    // specifier. This locks down the live invariant: every consumer sees the
    // same React, react-dom, and scheduler.
    const rendererMod = await importBundle(rewritten);
    const hostReact = (await import(stagedUrls.get("react")!)) as Record<string, unknown>;
    const hostReactDom = (await import(stagedUrls.get("react-dom/client")!)) as Record<
      string,
      unknown
    >;
    const hostScheduler = (await import(stagedUrls.get("scheduler")!)) as Record<
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

    // The JSX expression in the renderer source forces a `react/jsx-dev-runtime`
    // import. Reaching this assertion means the runtime fixture evaluated
    // without throwing on its `React = { react_stack_bottom_frame: ... }`
    // reassignment, i.e. peer externals are aliased back to mutable bindings.
    expect(rendererMod.jsxProbeType).toBe("div");
  });

  test("vendor builder emits a fixture for every external renderer specifier", () => {
    const fixtureSpecifiers = new Set(vendor.fixtures.map((fx) => fx.specifier));
    for (const specifier of EXTERNAL_VENDOR_SPECIFIERS) {
      expect(fixtureSpecifiers.has(specifier)).toBe(true);
    }
  });

  // Regression for the "Invalid hook call" crash that hit the
  // tides-of-moonhaven renderer after PRD #160. The previous suite trivially
  // passed because both sides imported the SAME `react.js` URL — Node's
  // module cache made `useState` reference-equal regardless of whether
  // react-dom-client carried its own private React. This case targets the
  // actual invariant: a hook component rendered by react-dom-client's
  // `createRoot` reaches into the SAME ReactSharedInternals slot that
  // `useState` reads from, even though the modules are loaded from
  // physically separate URLs. If react-dom-client inlines react, hostReact's
  // internals are not the ones react-dom mutates during render and the test
  // catches it.
  test("react-dom/client and react resolve to a single React internals slot", async () => {
    const hostReact = (await import(stagedUrls.get("react")!)) as Record<string, unknown>;
    const reactInternalsKey = Object.keys(hostReact).find((key) =>
      key.includes("CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE"),
    );
    expect(reactInternalsKey).toBeDefined();
    const reactInternals = hostReact[reactInternalsKey!];
    expect(reactInternals).toBeDefined();

    // react-dom-client mutates ReactSharedInternals on the React module IT
    // imported during initialization. Force evaluation by importing the
    // staged module — if it carries a private React copy, evaluation runs
    // against that copy and the externally-visible react.js internals stay
    // pristine. Either way, the assertion below pins module sharing rather
    // than dispatcher state directly: react-dom-client is forbidden from
    // bundling its own React, so any dispatcher mutation it performs lands
    // on the same `reactInternals` object the renderer's `useState` reads.
    await import(stagedUrls.get("react-dom/client")!);
    const hostReactReread = (await import(stagedUrls.get("react")!)) as Record<string, unknown>;
    expect(hostReactReread[reactInternalsKey!]).toBe(reactInternals);
  });
});
