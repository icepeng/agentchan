import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildRendererBundle,
  EXTERNAL_VENDOR_SPECIFIERS,
  findRendererEntrypoint,
  RendererV1Error,
  validateRendererImportPolicy,
} from "../../src/build/index.ts";

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "renderer-"));
  await mkdir(join(projectDir, "renderer"), { recursive: true });
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function writeRenderer(path: string, content: string): Promise<void> {
  await writeFile(join(projectDir, "renderer", path), content, "utf-8");
}

async function importBundle(js: string): Promise<Record<string, unknown>> {
  const tmpPath = join(tmpdir(), `renderer-bundle-${crypto.randomUUID()}.mjs`);
  await writeFile(tmpPath, js, "utf-8");
  try {
    return await import(pathToFileURL(tmpPath).href) as Record<string, unknown>;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Imports a bundle that contains externalised baseline vendor specifiers.
 * Mirrors the host document importmap by rewriting bare specifiers to file URLs
 * that point at the workspace's resolved react/scheduler installs.
 */
async function importExternalizedBundle(js: string): Promise<Record<string, unknown>> {
  let rewritten = js;
  for (const specifier of EXTERNAL_VENDOR_SPECIFIERS) {
    const resolved = pathToFileURL(import.meta.resolveSync(specifier)).href;
    rewritten = rewritten.replace(
      new RegExp(`(from\\s*)(["'])${escapeRegExp(specifier)}\\2`, "g"),
      `$1"${resolved}"`,
    );
  }
  return importBundle(rewritten);
}

describe("Renderer V1 entrypoint", () => {
  test("missing renderer entrypoint returns not found", () => {
    expect(findRendererEntrypoint(projectDir)).toBeNull();
  });

  test("renderer/index.ts is accepted", async () => {
    await writeRenderer("index.ts", "export const renderer = {};");

    expect(findRendererEntrypoint(projectDir)).toBe(
      join(projectDir, "renderer", "index.ts"),
    );
  });

  test("renderer/index.ts and renderer/index.tsx together are rejected", async () => {
    await writeRenderer("index.ts", "export const renderer = {};");
    await writeRenderer("index.tsx", "export const renderer = {};");

    expect(() => findRendererEntrypoint(projectDir)).toThrow(/not both/);
  });
});

describe("Renderer V1 import policy", () => {
  test("relative import inside renderer/ is accepted", async () => {
    await writeRenderer("helper.ts", "export const value = 1;");
    await writeRenderer(
      "index.tsx",
      'import { defineRenderer } from "@agentchan/renderer/core"; import { value } from "./helper"; export const renderer = defineRenderer(({ container }) => { container.textContent = String(value); return { update() {}, unmount() {} }; });',
    );

    await expect(
      validateRendererImportPolicy(
        join(projectDir, "renderer", "index.tsx"),
        join(projectDir, "renderer"),
      ),
    ).resolves.toBeUndefined();
  });

  test("relative import escaping renderer/ is rejected", async () => {
    await writeFile(join(projectDir, "outside.ts"), "export const value = 1;", "utf-8");
    await writeRenderer(
      "index.tsx",
      'import { value } from "../outside"; export const renderer = value;',
    );

    await expect(
      validateRendererImportPolicy(
        join(projectDir, "renderer", "index.tsx"),
        join(projectDir, "renderer"),
      ),
    ).rejects.toMatchObject({ phase: "policy" });
  });

  test("bare import outside the renderer contract is rejected", async () => {
    await writeRenderer(
      "index.tsx",
      'import clsx from "clsx"; export const renderer = clsx;',
    );

    await expect(
      validateRendererImportPolicy(
        join(projectDir, "renderer", "index.tsx"),
        join(projectDir, "renderer"),
      ),
    ).rejects.toThrow(/bare import is not allowed: clsx/);
  });

  test("each baseline vendor specifier is allowed", async () => {
    for (const specifier of EXTERNAL_VENDOR_SPECIFIERS) {
      await writeRenderer(
        "index.tsx",
        `import * as _ from "${specifier}"; export const renderer = _;`,
      );

      await expect(
        validateRendererImportPolicy(
          join(projectDir, "renderer", "index.tsx"),
          join(projectDir, "renderer"),
        ),
      ).resolves.toBeUndefined();
    }
  });

  test("host DOM and storage leak denylist is enforced", async () => {
    await writeRenderer(
      "index.tsx",
      "export const renderer = { mount() { localStorage.setItem('x', 'y'); return { update() {}, unmount() {} }; } };",
    );

    await expect(
      validateRendererImportPolicy(
        join(projectDir, "renderer", "index.tsx"),
        join(projectDir, "renderer"),
      ),
    ).rejects.toThrow(/localStorage\./);
  });
});

describe("Renderer V1 bundle", () => {
  test("vanilla renderer can bundle from renderer/index.ts without React adapter", async () => {
    await writeRenderer(
      "index.ts",
      `
        import { defineRenderer } from "@agentchan/renderer/core";

        export const renderer = defineRenderer(({ container, snapshot }) => {
          container.textContent = snapshot.slug;
          return {
            update(nextSnapshot) {
              container.textContent = nextSnapshot.slug;
            },
            unmount() {},
          };
        });
      `,
    );

    const bundle = await buildRendererBundle(projectDir);
    const mod = await importBundle(bundle?.js ?? "");

    expect(typeof (mod.renderer as { mount?: unknown }).mount).toBe("function");
    expect(bundle?.js).not.toContain("react-dom");
  });

  test("baseline vendor specifiers stay external in the bundle output", async () => {
    await writeRenderer(
      "index.tsx",
      `
        import * as _react from "react";
        import * as _reactDomClient from "react-dom/client";
        import * as _jsxRuntime from "react/jsx-runtime";
        import * as _jsxDevRuntime from "react/jsx-dev-runtime";
        import * as _scheduler from "scheduler";
        import { defineRenderer } from "@agentchan/renderer/core";

        // Pinning each namespace forces Bun to keep the import live in the bundle.
        export const _vendorPins = [
          _react,
          _reactDomClient,
          _jsxRuntime,
          _jsxDevRuntime,
          _scheduler,
        ];

        export const renderer = defineRenderer(({ container }) => {
          container.textContent = "";
          return { update() {}, unmount() {} };
        });
      `,
    );

    const bundle = await buildRendererBundle(projectDir);
    const js = bundle?.js ?? "";

    for (const specifier of EXTERNAL_VENDOR_SPECIFIERS) {
      // Externalised specifiers must appear as ESM import specifiers, not as
      // inlined CJS shells.
      expect(js).toMatch(new RegExp(`from\\s*["']${escapeRegExp(specifier)}["']`));
    }
    // React internals must not be inlined into the renderer bundle.
    expect(js).not.toMatch(/require_react_development|require_react_production/);
    expect(js).not.toMatch(/require_react_dom_client_development/);
    expect(js).not.toMatch(/require_scheduler_development/);
  });

  test("CSS import is accepted and appears in bundle CSS artifacts", async () => {
    await writeRenderer("style.css", ".root { color: red; }");
    await writeRenderer(
      "index.tsx",
      'import "./style.css"; import { defineRenderer } from "@agentchan/renderer/core"; export const renderer = defineRenderer(({ container }) => { container.className = "root"; return { update() {}, unmount() {} }; });',
    );

    const bundle = await buildRendererBundle(projectDir);

    expect(bundle?.css).toHaveLength(1);
    expect(bundle?.css[0]).toContain(".root");
  });

  test("fileUrl encodes paths and appends digest consistently", async () => {
    await writeRenderer(
      "index.tsx",
      `
        import { defineRenderer, fileUrl } from "@agentchan/renderer/core";
        const snapshot = { baseUrl: "/api/projects/demo/", files: [], state: {} };
        export function makeFileUrl() {
          return fileUrl(snapshot, { path: "/folder/a b.png", digest: "sha/1" });
        }
        export function makeFileUrlWithoutPath() {
          return fileUrl(snapshot, {});
        }
        export const renderer = defineRenderer(() => ({ update() {}, unmount() {} }));
      `,
    );

    const bundle = await buildRendererBundle(projectDir);
    const mod = await importBundle(bundle?.js ?? "");

    expect((mod.makeFileUrl as () => string)()).toBe(
      "/api/projects/demo/files/folder/a%20b.png?v=sha%2F1",
    );
    expect(() => (mod.makeFileUrlWithoutPath as () => string)()).toThrow(
      /requires a file path/,
    );
  });

  test("smoke: bundle exposes a working defineRenderer runtime", async () => {
    await writeRenderer(
      "index.ts",
      `
        import { defineRenderer } from "@agentchan/renderer/core";
        export const renderer = defineRenderer(({ container, snapshot }) => {
          container.textContent = snapshot.slug;
          return {
            update(next) { container.textContent = next.slug; },
            unmount() { container.textContent = ""; },
          };
        });
      `,
    );

    const bundle = await buildRendererBundle(projectDir);
    const mod = await importBundle(bundle?.js ?? "");
    const runtime = mod.renderer as {
      mount: (container: { textContent: string }, bridge: unknown) => {
        update: (next: { slug: string }) => void;
        unmount: () => void;
      };
    };

    const container = { textContent: "" };
    const instance = runtime.mount(container, {
      snapshot: { slug: "alpha", baseUrl: "/", files: [], state: {} },
      actions: { send() {}, fill() {} },
    });
    expect(container.textContent).toBe("alpha");
    instance.update({ slug: "beta" });
    expect(container.textContent).toBe("beta");
    instance.unmount();
    expect(container.textContent).toBe("");
  });

  test("React adapter preserves theme option on bundled runtime", async () => {
    await writeRenderer(
      "index.tsx",
      `
        import { createRenderer, type RendererProps } from "@agentchan/renderer/react";

        function Renderer(_props: RendererProps) {
          return null;
        }

        export const renderer = createRenderer(Renderer, {
          theme(snapshot) {
            return { base: { accent: snapshot.slug } };
          },
        });
      `,
    );

    const bundle = await buildRendererBundle(projectDir);
    const mod = await importExternalizedBundle(bundle?.js ?? "");
    const renderer = mod.renderer as {
      theme?: (snapshot: { slug: string }) => unknown;
    };

    expect(renderer.theme?.({ slug: "#abc" })).toEqual({ base: { accent: "#abc" } });
  });
});

describe("Renderer V1 errors", () => {
  test("entrypoint rejection exposes a stable phase", async () => {
    await writeRenderer("index.ts", "export const renderer = {};");
    await writeRenderer("index.tsx", "export const renderer = {};");

    try {
      findRendererEntrypoint(projectDir);
      expect.unreachable("expected entrypoint rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(RendererV1Error);
      expect((e as RendererV1Error).phase).toBe("entrypoint");
    }
  });
});

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
