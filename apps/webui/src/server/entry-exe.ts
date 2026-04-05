import { dirname, join } from "node:path";
import { appendFileSync } from "node:fs";

const exeDir = dirname(process.execPath);
const logPath = join(exeDir, "crash.log");

function writeCrashLog(err: unknown): void {
  try {
    const msg = `[${new Date().toISOString()}] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`;
    appendFileSync(logPath, msg);
  } catch {
    // nothing we can do
  }
}

process.on("uncaughtException", (err) => {
  console.error("Fatal:", err);
  writeCrashLog(err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("Fatal:", err);
  writeCrashLog(err);
  process.exit(1);
});

await import("./index.js");
