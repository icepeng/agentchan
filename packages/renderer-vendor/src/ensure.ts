import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVendorFixtures,
  VENDOR_SPECIFIERS,
  type VendorBuildResult,
  type VendorMode,
} from "./build.ts";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MARKER_FILENAME = ".vendor-cache.json";
const MARKER_VERSION = 3;

interface MarkerData {
  version: number;
  key: string;
  mode: VendorMode;
}

export type EnsureStatus = "fresh" | "missing" | "stale";

export interface EnsureVendorFixturesOptions {
  outDir: string;
  mode: VendorMode;
  /**
   * Absolute paths whose contents fingerprint vendor staleness. Typically the
   * repo lockfile and the vendor build script source. Caller passes these
   * explicitly so the staleness contract is testable without filesystem
   * conventions baked in.
   */
  inputs: string[];
}

export interface EnsureVendorFixturesResult {
  status: EnsureStatus;
  /** True if `buildVendorFixtures` actually ran during this call. */
  rebuilt: boolean;
  /** Cache key written to (or matched against) the marker. */
  key: string;
  /** Build result from this call's rebuild, or null when skipped. */
  build: VendorBuildResult | null;
}

/**
 * Default fingerprint inputs that govern fixture staleness:
 *   1. <repo>/bun.lock — pins react/react-dom/scheduler versions.
 *   2. <package>/src/build.ts — the actual fixture builder logic.
 */
export function defaultVendorInputs(): string[] {
  return [
    resolve(PACKAGE_DIR, "../../bun.lock"),
    resolve(PACKAGE_DIR, "src/build.ts"),
  ];
}

export async function ensureVendorFixtures(
  options: EnsureVendorFixturesOptions,
): Promise<EnsureVendorFixturesResult> {
  if (options.inputs.length === 0) {
    throw new Error(
      "ensureVendorFixtures: at least one input file is required to fingerprint staleness.",
    );
  }
  const key = await computeKey(options.inputs, options.mode);
  await mkdir(options.outDir, { recursive: true });

  const status = await detectStatus(options.outDir, key);
  if (status === "fresh") {
    return { status, rebuilt: false, key, build: null };
  }

  // Stale or missing: wipe the dir before rebuilding so a half-completed prior
  // build can't leave stray fixtures alongside the new ones.
  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(options.outDir, { recursive: true });
  const build = await buildVendorFixtures({ outDir: options.outDir, mode: options.mode });
  await writeMarker(options.outDir, { version: MARKER_VERSION, key, mode: options.mode });
  return { status, rebuilt: true, key, build };
}

async function computeKey(inputs: string[], mode: VendorMode): Promise<string> {
  const hash = createHash("sha256");
  hash.update(`marker-version:${MARKER_VERSION}\n`);
  hash.update(`mode:${mode}\n`);
  for (const inputPath of inputs) {
    const abs = resolve(inputPath);
    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch (err) {
      throw new Error(
        `ensureVendorFixtures: input ${abs} could not be read: ${(err as Error).message}`,
      );
    }
    hash.update(`input:${abs}\n`);
    hash.update(buf);
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function detectStatus(outDir: string, expectedKey: string): Promise<EnsureStatus> {
  const marker = await readMarker(outDir);
  if (marker == null) return "missing";
  if (marker.version !== MARKER_VERSION) return "stale";
  if (marker.key !== expectedKey) return "stale";
  for (const spec of VENDOR_SPECIFIERS) {
    try {
      await stat(join(outDir, spec.filename));
    } catch {
      return "missing";
    }
  }
  return "fresh";
}

async function readMarker(outDir: string): Promise<MarkerData | null> {
  try {
    const text = await readFile(join(outDir, MARKER_FILENAME), "utf-8");
    const parsed = JSON.parse(text) as MarkerData;
    if (typeof parsed.key !== "string" || typeof parsed.version !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeMarker(outDir: string, marker: MarkerData): Promise<void> {
  await writeFile(
    join(outDir, MARKER_FILENAME),
    `${JSON.stringify(marker, null, 2)}\n`,
    "utf-8",
  );
}
