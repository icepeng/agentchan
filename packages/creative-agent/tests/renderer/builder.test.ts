import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildRendererBundle,
  findRendererEntrypoint,
  RendererV1Error,
  validateRendererImportPolicy,
} from "../../src/renderer/index.js";

let projectDir: string;

const RUNTIME_DIR_ENV = "AGENTCHAN_RENDERER_RUNTIME_DIR";
const EXPERIMENTAL_DEPS_ENV = "AGENTCHAN_RENDERER_EXPERIMENTAL_DEPS";
const LEFT_PAD_MANIFEST = JSON.stringify({ dependencies: { "left-pad": "^1.3.0" } });

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

async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(vars).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withLeftPadRuntime<T>(
  options: {
    runtimeManifest?: string;
    packageManifest?: string;
    source?: string;
  },
  run: (runtimeDir: string) => Promise<T>,
): Promise<T> {
  const runtimeDir = await mkdtemp(join(tmpdir(), "renderer-runtime-"));
  try {
    await mkdir(join(runtimeDir, "node_modules", "left-pad"), { recursive: true });
    await writeFile(
      join(runtimeDir, "package.json"),
      options.runtimeManifest ?? LEFT_PAD_MANIFEST,
      "utf-8",
    );
    await writeFile(
      join(runtimeDir, "node_modules", "left-pad", "package.json"),
      options.packageManifest ?? JSON.stringify({ name: "left-pad" }),
      "utf-8",
    );
    if (options.source) {
      await writeFile(
        join(runtimeDir, "node_modules", "left-pad", "index.js"),
        options.source,
        "utf-8",
      );
    }
    return await run(runtimeDir);
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
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

  test("declared runtime dependency is rejected unless experimental deps are enabled", async () => {
    await withLeftPadRuntime({}, async (runtimeDir) => {
      await writeRenderer(
        "index.tsx",
        'import leftPad from "left-pad"; export const renderer = leftPad;',
      );

      await withEnv({
        [RUNTIME_DIR_ENV]: runtimeDir,
        [EXPERIMENTAL_DEPS_ENV]: undefined,
      }, async () => {
        await expect(
          validateRendererImportPolicy(
            join(projectDir, "renderer", "index.tsx"),
            join(projectDir, "renderer"),
          ),
        ).rejects.toThrow(/bare import is not allowed: left-pad/);
      });
    });
  });

  test("declared runtime dependency is accepted for experimental deps", async () => {
    await withLeftPadRuntime({}, async (runtimeDir) => {
      await writeRenderer(
        "index.tsx",
        'import leftPad from "left-pad"; export const renderer = leftPad;',
      );

      await withEnv({
        [RUNTIME_DIR_ENV]: runtimeDir,
        [EXPERIMENTAL_DEPS_ENV]: "1",
      }, async () => {
        await expect(
          validateRendererImportPolicy(
            join(projectDir, "renderer", "index.tsx"),
            join(projectDir, "renderer"),
          ),
        ).resolves.toBeUndefined();
      });
    });
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
  test("experimental runtime dependency can bundle when env flag is enabled", async () => {
    await withLeftPadRuntime({
      runtimeManifest: JSON.stringify({ type: "module", dependencies: { "left-pad": "^1.3.0" } }),
      packageManifest: JSON.stringify({ name: "left-pad", type: "module", exports: "./index.js" }),
      source: "export default function leftPad(value, length, char = ' ') { return String(value).padStart(length, char); }",
    }, async (runtimeDir) => {
      await writeRenderer(
        "index.ts",
        `
          import leftPad from "left-pad";
          import { defineRenderer } from "@agentchan/renderer/core";

          export function pad(value: string) {
            return leftPad(value, 3, "0");
          }

          export const renderer = defineRenderer(({ container }) => {
            container.textContent = pad("7");
            return { update() {}, unmount() {} };
          });
        `,
      );

      await withEnv({
        [RUNTIME_DIR_ENV]: runtimeDir,
        [EXPERIMENTAL_DEPS_ENV]: "1",
      }, async () => {
        const bundle = await buildRendererBundle(projectDir);
        const mod = await importBundle(bundle?.js ?? "");

        expect((mod.pad as (value: string) => string)("7")).toBe("007");
      });
    });
  });

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
