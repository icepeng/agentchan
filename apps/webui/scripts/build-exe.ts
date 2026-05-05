import { $ } from "bun";
import { join } from "node:path";
import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  prepareReleaseRendererVendor,
  verifyReleaseVendorAssets,
} from "./release-vendor.ts";

const WEBUI_ROOT = join(import.meta.dir, "..");
const MONOREPO_ROOT = join(WEBUI_ROOT, "../..");
const DIST_DIR = join(WEBUI_ROOT, "dist/exe");
const VENDOR_ROOT = join(WEBUI_ROOT, "public/vendor");

// Parse --target flag (e.g., --target=bun-linux-x64)
const targetFlag = process.argv.find((a) => a.startsWith("--target="));
const target = targetFlag?.split("=")[1];

const isWindows = target?.includes("windows") ?? process.platform === "win32";
const exeName = isWindows ? "agentchan.exe" : "agentchan";

// Clean output directory
if (existsSync(DIST_DIR)) await rm(DIST_DIR, { recursive: true });
await mkdir(DIST_DIR, { recursive: true });

// 1. Build production renderer vendor fixtures into vite's static asset tree.
//    This must run before vite build so prod/*.js end up in dist/client/vendor/prod/.
//    The dev fixture is intentionally absent from release artifacts.
console.log("[1/5] Preparing renderer vendor fixtures (production only)...");
await prepareReleaseRendererVendor({ vendorRoot: VENDOR_ROOT });

// 2. Build client assets with Vite
console.log("[2/5] Building client...");
await $`cd ${WEBUI_ROOT} && bunx vite build`;

// 3. Compile server to single executable
console.log("[3/5] Compiling server binary...");
const targetArgs = target ? ["--target", target] : [];
const entrypoint = join(WEBUI_ROOT, "src/server/entry-exe.ts");
const outfile = join(DIST_DIR, exeName);
await $`bun build --compile ${targetArgs} --outfile ${outfile} ${entrypoint}`;

// 4. Copy sidecar files
console.log("[4/5] Copying sidecar files...");

await cp(join(WEBUI_ROOT, "dist/client"), join(DIST_DIR, "public"), {
  recursive: true,
});

await cp(join(MONOREPO_ROOT, "example_data"), join(DIST_DIR, "data"), {
  recursive: true,
});

verifyReleaseVendorAssets({ vendorRoot: join(DIST_DIR, "public/vendor") });

console.log(`\nBuild complete: ${DIST_DIR}/`);
console.log(`  ${exeName}`);
console.log("  public/");
console.log("  data/");

// 5. Startup smoke test (native target only)
console.log("\n[5/5] Startup smoke test...");
await runStartupSmoke();

function isNativeTarget(t: string | undefined): boolean {
  if (!t) return true;
  const platMap: Record<string, string | undefined> = {
    win32: "windows",
    linux: "linux",
    darwin: "darwin",
  };
  const hostPlat = platMap[process.platform];
  const hostArch = process.arch; // "x64" | "arm64" | ...
  if (!hostPlat) return false;
  const m = /^bun-(windows|linux|darwin)-(x64|arm64)$/.exec(t);
  if (!m) return false;
  return m[1] === hostPlat && m[2] === hostArch;
}

async function runStartupSmoke(): Promise<void> {
  const native = isNativeTarget(target);
  if (!native) {
    console.log(
      `  skip (cross-target build: host=${process.platform}-${process.arch}, target=${target}).`,
    );
    return;
  }

  const PREFIX = "agentchan-exe-smoke-";
  const TMP_ROOT = tmpdir();

  // Cleanup any leftover smoke dirs from prior runs.
  try {
    for (const entry of await readdir(TMP_ROOT)) {
      if (entry.startsWith(PREFIX)) {
        await rm(join(TMP_ROOT, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // ignore — directory listing best-effort
  }

  // Fresh isolated workspace.
  const tmpDir = join(TMP_ROOT, `${PREFIX}${randomBytes(6).toString("hex")}`);
  await mkdir(tmpDir, { recursive: true });
  await cp(DIST_DIR, tmpDir, { recursive: true, dereference: true });

  const tmpExe = join(tmpDir, exeName);
  // High random port to avoid collision with the dev server (3000) or other services.
  const port = 50000 + Math.floor(Math.random() * 10000);

  const proc = Bun.spawn([tmpExe], {
    cwd: tmpDir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      AGENTCHAN_NO_AUTO_OPEN: "1",
    },
  });

  const BOOT_SIGNAL = "agentchan webui server running";
  const REGRESSION_KEYWORDS = ["ENOENT", "Uncaught", "Fatal:"];
  const TIMEOUT_MS = 3000;

  let stdoutBuf = "";
  let stderrBuf = "";
  let bootSeen = false;
  let regressionSeen: string | null = null;

  const consumeStream = async (
    stream: ReadableStream<Uint8Array>,
    onChunk: (chunk: string) => void,
  ): Promise<void> => {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }
  };

  const stdoutPromise = consumeStream(proc.stdout as ReadableStream<Uint8Array>, (chunk) => {
    stdoutBuf += chunk;
    if (!bootSeen && stdoutBuf.includes(BOOT_SIGNAL)) {
      bootSeen = true;
    }
  });
  const stderrPromise = consumeStream(proc.stderr as ReadableStream<Uint8Array>, (chunk) => {
    stderrBuf += chunk;
    if (regressionSeen === null) {
      for (const kw of REGRESSION_KEYWORDS) {
        if (stderrBuf.includes(kw)) {
          regressionSeen = kw;
          break;
        }
      }
    }
  });

  const timer = new Promise<"timer">((resolve) => {
    setTimeout(() => resolve("timer"), TIMEOUT_MS);
  });
  const exited = proc.exited.then(() => "exited" as const);

  const winner = await Promise.race([timer, exited]);
  const selfTerminated = winner === "exited";

  if (!selfTerminated) {
    proc.kill();
  }

  // Drain remaining output. Exit-code is intentionally ignored — see ADR/issue notes
  // (Bun on Windows SIGTERM behavior is unreliable as a success signal).
  await Promise.allSettled([stdoutPromise, stderrPromise, proc.exited]);

  const failures: string[] = [];
  if (selfTerminated) failures.push("process exited before timer");
  if (!bootSeen) failures.push(`boot signal ${JSON.stringify(BOOT_SIGNAL)} not seen`);
  if (regressionSeen) failures.push(`stderr regression keyword ${JSON.stringify(regressionSeen)}`);

  if (failures.length === 0) {
    console.log("  ok — boot signal seen, no regression keywords.");
    await rm(tmpDir, { recursive: true, force: true });
    return;
  }

  console.error(`  FAIL: ${failures.join("; ")}`);
  console.error(`  temp dir preserved: ${tmpDir}`);
  if (stdoutBuf) console.error(`  --- stdout ---\n${stdoutBuf}`);
  if (stderrBuf) console.error(`  --- stderr ---\n${stderrBuf}`);
  process.exit(1);
}
