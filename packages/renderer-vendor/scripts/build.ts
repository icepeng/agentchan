import { mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { VendorMode } from "../src/build.ts";
import { defaultVendorInputs, ensureVendorFixtures } from "../src/ensure.ts";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = resolve(PACKAGE_DIR, "../../apps/webui/public/vendor");

interface CliOptions {
  outDir: string;
  modes: VendorMode[];
  clean: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    outDir: DEFAULT_OUT_DIR,
    modes: ["development", "production"],
    clean: false,
  };
  for (const arg of argv) {
    if (arg.startsWith("--out-dir=")) {
      const value = arg.slice("--out-dir=".length);
      opts.outDir = isAbsolute(value) ? value : resolve(process.cwd(), value);
    } else if (arg === "--dev") {
      opts.modes = ["development"];
    } else if (arg === "--prod") {
      opts.modes = ["production"];
    } else if (arg === "--clean") {
      opts.clean = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }
  return opts;
}

function printUsage(): void {
  console.error(
    `Usage: bun run packages/renderer-vendor/scripts/build.ts [options]

Options:
  --out-dir=<dir>   Output root (default: apps/webui/public/vendor)
  --dev             Build only the development fixture
  --prod            Build only the production fixture
  --clean           Remove the output root before building
  -h, --help        Show this help`,
  );
}

const opts = parseArgs(process.argv.slice(2));

if (opts.clean) {
  await rm(opts.outDir, { recursive: true, force: true });
}
await mkdir(opts.outDir, { recursive: true });

for (const mode of opts.modes) {
  const subDir = join(opts.outDir, mode === "development" ? "dev" : "prod");
  const result = await ensureVendorFixtures({
    outDir: subDir,
    mode,
    inputs: defaultVendorInputs(),
  });
  if (result.rebuilt && result.build) {
    console.log(
      `[${mode}] ${result.build.fixtures.length} fixtures → ${result.build.outDir} (${result.status})`,
    );
    for (const fx of result.build.fixtures) {
      console.log(`  ${fx.specifier.padEnd(24)} ${fx.exportNames.length} named exports`);
    }
  } else {
    console.log(`[${mode}] fixtures fresh, skipped (${subDir})`);
  }
}
