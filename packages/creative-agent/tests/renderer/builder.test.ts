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
  validateRendererTheme,
} from "../../src/renderer/index.js";

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

describe("Renderer V1 entrypoint", () => {
  test("missing renderer/index.tsx returns not found", () => {
    expect(findRendererEntrypoint(projectDir)).toBeNull();
  });

  test("renderer/index.ts is rejected", async () => {
    await writeRenderer("index.ts", "export default function Renderer() { return null; }");

    expect(() => findRendererEntrypoint(projectDir)).toThrow(
      /renderer\/index\.tsx/,
    );
  });
});

describe("Renderer V1 import policy", () => {
  test("relative import inside renderer/ is accepted", async () => {
    await writeRenderer("helper.ts", "export const value = 1;");
    await writeRenderer(
      "index.tsx",
      'import { value } from "./helper"; export default function Renderer() { return value; }',
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
      'import { value } from "../outside"; export default function Renderer() { return value; }',
    );

    await expect(
      validateRendererImportPolicy(
        join(projectDir, "renderer", "index.tsx"),
        join(projectDir, "renderer"),
      ),
    ).rejects.toMatchObject({ phase: "policy" });
  });

  test("bare import other than react and agentchan:renderer/v1 is rejected", async () => {
    await writeRenderer(
      "index.tsx",
      'import clsx from "clsx"; export default function Renderer() { return clsx; }',
    );

    await expect(
      validateRendererImportPolicy(
        join(projectDir, "renderer", "index.tsx"),
        join(projectDir, "renderer"),
      ),
    ).rejects.toThrow(/bare import is not allowed: clsx/);
  });

  test("host DOM and storage leak denylist is enforced", async () => {
    await writeRenderer(
      "index.tsx",
      "export default function Renderer() { localStorage.setItem('x', 'y'); return null; }",
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
  test("CSS import is accepted and appears in bundle CSS artifacts", async () => {
    await writeRenderer("style.css", ".root { color: red; }");
    await writeRenderer(
      "index.tsx",
      'import "./style.css"; export default function Renderer() { return null; }',
    );

    const bundle = await buildRendererBundle(projectDir);

    expect(bundle?.css).toHaveLength(1);
    expect(bundle?.css[0]).toContain(".root");
  });

  test("Agentchan.fileUrl encodes paths and appends digest consistently", async () => {
    await writeRenderer(
      "index.tsx",
      `
        import { Agentchan } from "agentchan:renderer/v1";
        const snapshot = { baseUrl: "/api/projects/demo/", files: [], state: {} };
        export function makeFileUrl() {
          return Agentchan.fileUrl(snapshot, { path: "/folder/a b.png", digest: "sha/1" });
        }
        export function makeFileUrlWithoutPath() {
          return Agentchan.fileUrl(snapshot, {});
        }
        export default function Renderer() { return null; }
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

describe("Renderer V1 theme", () => {
  test("theme validation uses tolerant runtime normalization", () => {
    expect(validateRendererTheme({
      base: { accent: "#0aa", unknown: "#fff" },
      dark: "invalid",
      prefersScheme: "system",
    })).toEqual({ base: { accent: "#0aa" } });
  });

  test("theme validation returns null for invalid base shape", () => {
    expect(validateRendererTheme({ base: { unknown: "#fff" } })).toBeNull();
    expect(validateRendererTheme("not an object")).toBeNull();
  });
});

describe("Renderer V1 errors", () => {
  test("entrypoint rejection exposes a stable phase", async () => {
    await writeRenderer("index.ts", "export default function Renderer() { return null; }");

    try {
      findRendererEntrypoint(projectDir);
      expect.unreachable("expected entrypoint rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(RendererV1Error);
      expect((e as RendererV1Error).phase).toBe("entrypoint");
    }
  });
});
