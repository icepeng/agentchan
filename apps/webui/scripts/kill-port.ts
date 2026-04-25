/**
 * Kill any process listening on the given port.
 * Usage: bun scripts/kill-port.ts [port]
 */
const port = process.argv[2] || "3000";

if (!/^\d+$/.test(port)) {
  console.error(`Invalid port: ${port}`);
  process.exit(1);
}

try {
  if (process.platform === "win32") {
    const proc = Bun.spawnSync(["cmd", "/c", `netstat -ano | findstr :${port} | findstr LISTENING`]);
    const output = proc.stdout.toString();
    const pids = new Set<string>();
    for (const line of output.trim().split("\n")) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      Bun.spawnSync(["taskkill", "/PID", pid, "/T", "/F"]);
    }
  } else {
    Bun.spawnSync(["sh", "-c", `lsof -ti:${port} | xargs kill -9 2>/dev/null`]);
  }
} catch {
  // No process on port; nothing to kill.
}
