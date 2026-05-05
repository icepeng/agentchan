import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildVendorFixtures,
  VENDOR_SPECIFIERS,
} from "@agentchan/renderer-vendor";

export interface ReleaseVendorOptions {
  /** Vendor root that vite serves at `/vendor/`. The release tree gets a `prod/` child. */
  vendorRoot: string;
}

export async function prepareReleaseRendererVendor(
  options: ReleaseVendorOptions,
): Promise<void> {
  await rm(options.vendorRoot, { recursive: true, force: true });
  await mkdir(options.vendorRoot, { recursive: true });
  await buildVendorFixtures({
    outDir: join(options.vendorRoot, "prod"),
    mode: "production",
  });
}

export function verifyReleaseVendorAssets(
  options: ReleaseVendorOptions,
): void {
  const prodDir = join(options.vendorRoot, "prod");
  for (const spec of VENDOR_SPECIFIERS) {
    const path = join(prodDir, spec.filename);
    if (!existsSync(path)) {
      throw new Error(`Release vendor fixture missing: ${path}`);
    }
  }
  const devDir = join(options.vendorRoot, "dev");
  if (existsSync(devDir)) {
    throw new Error(
      `Release vendor tree contains dev fixture (must ship prod only): ${devDir}`,
    );
  }
}
