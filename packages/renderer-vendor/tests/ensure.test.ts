import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureVendorFixtures, VENDOR_SPECIFIERS } from "../src/index.ts";

let outDir: string;
let inputDir: string;
let lockfile: string;
let buildScript: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "renderer-vendor-ensure-out-"));
  inputDir = await mkdtemp(join(tmpdir(), "renderer-vendor-ensure-in-"));
  lockfile = join(inputDir, "bun.lock");
  buildScript = join(inputDir, "build.ts");
  await writeFile(lockfile, "lockfile-v1\n", "utf-8");
  await writeFile(buildScript, "// build script v1\n", "utf-8");
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
  await rm(inputDir, { recursive: true, force: true });
});

describe("ensureVendorFixtures", () => {
  test("builds the dev fixture set on first call and reports `missing`", async () => {
    const result = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });
    expect(result.status).toBe("missing");
    expect(result.rebuilt).toBe(true);
    expect(result.build).not.toBeNull();
    for (const spec of VENDOR_SPECIFIERS) {
      expect(await Bun.file(join(outDir, spec.filename)).exists()).toBe(true);
    }
  });

  test("skips rebuild on second call with unchanged inputs and reports `fresh`", async () => {
    const first = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });
    expect(first.rebuilt).toBe(true);

    const second = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });
    expect(second.status).toBe("fresh");
    expect(second.rebuilt).toBe(false);
    expect(second.build).toBeNull();
    expect(second.key).toBe(first.key);
  });

  test("rebuilds when lockfile contents change and reports `stale`", async () => {
    const first = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });

    await writeFile(lockfile, "lockfile-v2\n", "utf-8");
    const second = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });
    expect(second.status).toBe("stale");
    expect(second.rebuilt).toBe(true);
    expect(second.key).not.toBe(first.key);
  });

  test("rebuilds when vendor build script contents change and reports `stale`", async () => {
    const first = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });

    await writeFile(buildScript, "// build script v2\n", "utf-8");
    const second = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });
    expect(second.status).toBe("stale");
    expect(second.rebuilt).toBe(true);
    expect(second.key).not.toBe(first.key);
  });

  test("rebuilds when a fixture file was deleted and reports `missing`", async () => {
    await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });
    const firstSpec = VENDOR_SPECIFIERS[0];
    if (!firstSpec) throw new Error("VENDOR_SPECIFIERS is empty");
    await unlink(join(outDir, firstSpec.filename));

    const result = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });
    expect(result.status).toBe("missing");
    expect(result.rebuilt).toBe(true);
    expect(await Bun.file(join(outDir, firstSpec.filename)).exists()).toBe(true);
  });

  test("treats mode change as `stale`: a dev marker does not satisfy a prod request", async () => {
    const dev = await ensureVendorFixtures({
      outDir,
      mode: "development",
      inputs: [lockfile, buildScript],
    });

    const prod = await ensureVendorFixtures({
      outDir,
      mode: "production",
      inputs: [lockfile, buildScript],
    });
    expect(prod.status).toBe("stale");
    expect(prod.rebuilt).toBe(true);
    expect(prod.key).not.toBe(dev.key);
  });
});
