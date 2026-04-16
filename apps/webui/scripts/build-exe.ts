import { $ } from "bun";
import { join } from "node:path";
import { cp, mkdir, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const WEBUI_ROOT = join(import.meta.dir, "..");
const MONOREPO_ROOT = join(WEBUI_ROOT, "../..");
const DIST_DIR = join(WEBUI_ROOT, "dist/exe");

// Parse --target flag (e.g., --target=bun-linux-x64)
const targetFlag = process.argv.find((a) => a.startsWith("--target="));
const target = targetFlag?.split("=")[1];

const isWindows = target?.includes("windows") ?? process.platform === "win32";
const exeName = isWindows ? "agentchan.exe" : "agentchan";

// Clean output directory
if (existsSync(DIST_DIR)) await rm(DIST_DIR, { recursive: true });
await mkdir(DIST_DIR, { recursive: true });

// 1. Build client assets with Vite
console.log("[1/3] Building client...");
await $`cd ${WEBUI_ROOT} && bunx vite build`;

// 2. Compile server to single executable
console.log("[2/3] Compiling server binary...");
const targetArgs = target ? ["--target", target] : [];
const entrypoint = join(WEBUI_ROOT, "src/server/entry-exe.ts");
const outfile = join(DIST_DIR, exeName);
await $`bun build --compile ${targetArgs} --outfile ${outfile} ${entrypoint}`;

// 3. Copy sidecar files
console.log("[3/3] Copying sidecar files...");

await cp(join(WEBUI_ROOT, "dist/client"), join(DIST_DIR, "public"), {
  recursive: true,
});

await cp(join(MONOREPO_ROOT, "example_data"), join(DIST_DIR, "data"), {
  recursive: true,
});

// Renderer authoring assets (consumed by /api/system/* and the bundler). The
// server's paths.ts looks them up under data/_system/ in compiled mode.
const systemDir = join(DIST_DIR, "data/_system");
await mkdir(systemDir, { recursive: true });
await copyFile(
  join(MONOREPO_ROOT, "packages/renderer-runtime/src/index.ts"),
  join(systemDir, "renderer-runtime.ts"),
);
await copyFile(
  join(MONOREPO_ROOT, "packages/renderer-types/src/index.ts"),
  join(systemDir, "renderer-types.ts"),
);

console.log(`\nBuild complete: ${DIST_DIR}/`);
console.log(`  ${exeName}`);
console.log("  public/");
console.log("  data/");
console.log("  data/_system/ (renderer runtime + types)");
