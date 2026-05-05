import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VENDOR_SPECIFIERS } from "@agentchan/renderer-vendor";
import {
  prepareReleaseRendererVendor,
  verifyReleaseVendorAssets,
} from "../../scripts/release-vendor.ts";

let workRoot: string;

beforeEach(async () => {
  workRoot = await mkdtemp(join(tmpdir(), "agentchan-release-vendor-"));
});

afterEach(async () => {
  await rm(workRoot, { recursive: true, force: true });
});

describe("prepareReleaseRendererVendor", () => {
  test("emits all baseline specifiers under prod/, never under dev/", async () => {
    const vendorRoot = join(workRoot, "vendor");
    await prepareReleaseRendererVendor({ vendorRoot });
    for (const spec of VENDOR_SPECIFIERS) {
      expect(existsSync(join(vendorRoot, "prod", spec.filename))).toBe(true);
    }
    expect(existsSync(join(vendorRoot, "dev"))).toBe(false);
  });

  test("removes pre-existing dev fixtures so release artifacts never leak them", async () => {
    const vendorRoot = join(workRoot, "vendor");
    await mkdir(join(vendorRoot, "dev"), { recursive: true });
    await writeFile(join(vendorRoot, "dev", "react.js"), "// stale dev fixture", "utf-8");
    await prepareReleaseRendererVendor({ vendorRoot });
    expect(existsSync(join(vendorRoot, "dev"))).toBe(false);
    expect(existsSync(join(vendorRoot, "prod", "react.js"))).toBe(true);
  });
});

describe("verifyReleaseVendorAssets", () => {
  test("passes when every baseline specifier exists in prod/ and dev/ is absent", async () => {
    const vendorRoot = join(workRoot, "vendor");
    await prepareReleaseRendererVendor({ vendorRoot });
    expect(() => verifyReleaseVendorAssets({ vendorRoot })).not.toThrow();
  });

  test("throws when a baseline specifier is missing from prod/", async () => {
    const vendorRoot = join(workRoot, "vendor");
    await prepareReleaseRendererVendor({ vendorRoot });
    const target = join(vendorRoot, "prod", VENDOR_SPECIFIERS[0]!.filename);
    await rm(target);
    expect(() => verifyReleaseVendorAssets({ vendorRoot })).toThrow(
      /missing/i,
    );
  });

  test("throws when dev/ leaked into the release tree", async () => {
    const vendorRoot = join(workRoot, "vendor");
    await prepareReleaseRendererVendor({ vendorRoot });
    await mkdir(join(vendorRoot, "dev"), { recursive: true });
    expect(() => verifyReleaseVendorAssets({ vendorRoot })).toThrow(
      /dev fixture/i,
    );
  });
});
