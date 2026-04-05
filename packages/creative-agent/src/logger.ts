import pc from "picocolors";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel: number =
  LEVELS[process.env.LOG_LEVEL as LogLevel] ?? LEVELS.info;

function timestamp(): string {
  const d = new Date();
  return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}]`;
}

function write(
  level: LogLevel,
  tag: string,
  msg: string,
  detail?: string,
): void {
  if (LEVELS[level] < currentLevel) return;
  const color =
    level === "error" ? pc.red : level === "warn" ? pc.yellow : pc.cyan;
  process.stderr.write(color(`${timestamp()} [${tag}] ${msg}`) + "\n");
  if (detail) {
    const indented = detail
      .split("\n")
      .map((l) => `           ${l}`)
      .join("\n");
    process.stderr.write(pc.dim(indented) + "\n");
  }
}

export function debug(tag: string, msg: string, detail?: string): void {
  write("debug", tag, msg, detail);
}
export function info(tag: string, msg: string, detail?: string): void {
  write("info", tag, msg, detail);
}
export function warn(tag: string, msg: string, detail?: string): void {
  write("warn", tag, msg, detail);
}
export function error(tag: string, msg: string, detail?: string): void {
  write("error", tag, msg, detail);
}

export function isEnabled(level: LogLevel): boolean {
  return LEVELS[level] >= currentLevel;
}
