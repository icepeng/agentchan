/**
 * Unified dev server launcher with custom file watching and graceful shutdown.
 *
 * - Watches apps/webui/src/server/ and packages/ for changes
 * - Restarts the backend server on file changes (debounced)
 * - Properly kills process trees on Windows (taskkill /T /F)
 *
 * Usage:
 *   portless run --name agentchan bun scripts/dev.ts   # agentchan.localhost (via portless)
 *   bun scripts/dev.ts                                 # server :3000, client :4100 (no portless)
 *   bun scripts/dev.ts --port 3001                     # server :3001, client :4101
 */
import { watch, type FSWatcher } from "node:fs";
import { resolve, relative, extname } from "node:path";

// --- CLI args & constants ---

const cliArgs = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = cliArgs.indexOf(`--${name}`);
  return idx !== -1 ? cliArgs[idx + 1] : undefined;
}

// Port resolution:
//   --port flag       → manual mode (server=--port, client=--port+1100)
//   PORTLESS_URL set  → portless mode (client=PORT from portless, server=PORT+1)
//   otherwise         → defaults (server 3000, client 4100)
const explicitPort = getArg("port");

let serverPort: number;
let clientPort: number;

if (explicitPort) {
  serverPort = Number(explicitPort);
  clientPort = Number(getArg("client-port") ?? serverPort + 1100);
} else if (process.env.PORTLESS_URL) {
  clientPort = Number(process.env.PORT);
  serverPort = clientPort + 1;
} else {
  serverPort = 3000;
  clientPort = 4100;
}
const webRoot = resolve(import.meta.dir, "..");
const monorepoRoot = resolve(webRoot, "../..");
const killPortScript = resolve(webRoot, "scripts/kill-port.ts");

const env = {
  ...process.env,
  PORT: String(serverPort),
  SERVER_PORT: String(serverPort),
  CLIENT_PORT: String(clientPort),
};

// --- Utilities ---

function killTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } else {
      try { process.kill(-pid, "SIGTERM"); } catch {}
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  } catch {}
}

function freePort(port: number): void {
  Bun.spawnSync(["bun", killPortScript, String(port)]);
}

// --- File watching ---

const WATCH_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".json"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "data", ".turbo", ".git"]);

function isRelevant(filename: string): boolean {
  const parts = filename.split(/[\\/]/);
  return !parts.some((p) => IGNORE_DIRS.has(p)) && WATCH_EXTS.has(extname(filename));
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const watchers: FSWatcher[] = [];

function startWatching(): void {
  const dirs = [resolve(webRoot, "src/server"), resolve(monorepoRoot, "packages")];

  for (const dir of dirs) {
    const w = watch(dir, { recursive: true }, (_evt, filename) => {
      if (!filename || !isRelevant(filename)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const rel = relative(monorepoRoot, resolve(dir, filename)).replace(/\\/g, "/");
        console.log(`\n[dev] Change detected: ${rel}`);
        restartServer();
      }, 300);
    });
    watchers.push(w);
  }

  console.log("[dev] Watching for changes:");
  for (const dir of dirs) {
    console.log(`  ${relative(monorepoRoot, dir).replace(/\\/g, "/")}/`);
  }
}

// --- Server lifecycle ---

let serverPid: number | null = null;
let isRestarting = false;
let isCleaningUp = false;

function spawnServer(): void {
  const proc = Bun.spawn(["bun", "src/server/index.ts"], {
    cwd: webRoot,
    env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  serverPid = proc.pid;
  proc.exited.then((code) => {
    serverPid = null;
    if (!isRestarting && !isCleaningUp) {
      console.error(`[dev] Server exited unexpectedly (code ${code})`);
    }
  });
}

function restartServer(): void {
  if (isRestarting || isCleaningUp) return;
  isRestarting = true;
  console.log("[dev] Restarting server...");

  if (serverPid) killTree(serverPid);

  setTimeout(() => {
    freePort(serverPort);
    spawnServer();
    isRestarting = false;
  }, 500);
}

// --- Cleanup ---

let clientPid: number | null = null;

function cleanup(): void {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log("\n[dev] Shutting down...");

  for (const w of watchers) {
    try {
      w.close();
    } catch {}
  }
  if (serverPid) killTree(serverPid);
  if (clientPid) killTree(clientPid);
  freePort(serverPort);
  freePort(clientPort);
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// --- Startup ---

freePort(serverPort);
freePort(clientPort);

const portlessUrl = process.env.PORTLESS_URL;
console.log(
  `Starting dev server — server :${serverPort}, client :${clientPort}` +
    (portlessUrl ? ` (${portlessUrl})` : ""),
);

spawnServer();

const clientProc = Bun.spawn(["bun", "vite"], {
  cwd: webRoot,
  env,
  stdio: ["inherit", "inherit", "inherit"],
});
clientPid = clientProc.pid;

clientProc.exited.then((code) => {
  clientPid = null;
  if (!isCleaningUp) {
    console.log(`[dev] Client exited (code ${code})`);
    cleanup();
  }
});

startWatching();
