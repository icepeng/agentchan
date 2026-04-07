import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as log from "../logger.js";
import type {
  CompiledHook,
  CompiledHookConfig,
  HookConfig,
  HookConfigEntry,
  HookEventName,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const VALID_EVENTS: HookEventName[] = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
];

function compileMatcher(matcher: string | undefined): RegExp | undefined {
  if (!matcher || matcher === "*") return undefined;
  // Anchor to full tool name.
  const pattern = matcher.startsWith("^") ? matcher : `^(?:${matcher})$`;
  try {
    return new RegExp(pattern);
  } catch (err) {
    log.warn("hooks", `invalid matcher "${matcher}": ${(err as Error).message}`);
    return undefined;
  }
}

function compileEntry(entry: HookConfigEntry): CompiledHook | null {
  if (!entry || typeof entry.file !== "string" || !entry.file.trim()) {
    log.warn("hooks", `skipping hook entry: missing "file"`);
    return null;
  }
  return {
    matcher: compileMatcher(entry.matcher),
    file: entry.file,
    timeout:
      typeof entry.timeout === "number" && entry.timeout > 0
        ? entry.timeout
        : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Load and compile `hooks.json` from a project directory.
 * Missing file → empty config (not an error).
 */
export async function loadHookConfig(projectDir: string): Promise<CompiledHookConfig> {
  const path = join(projectDir, "hooks.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return {};
    log.warn("hooks", `failed to read ${path}: ${err?.message ?? err}`);
    return {};
  }

  let parsed: HookConfig;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn("hooks", `invalid JSON in ${path}: ${(err as Error).message}`);
    return {};
  }

  const compiled: CompiledHookConfig = {};
  for (const event of VALID_EVENTS) {
    const entries = parsed[event];
    if (!Array.isArray(entries)) continue;
    const list: CompiledHook[] = [];
    for (const entry of entries) {
      const c = compileEntry(entry);
      if (c) list.push(c);
    }
    if (list.length > 0) compiled[event] = list;
  }

  const totalHooks = Object.values(compiled).reduce((n, arr) => n + (arr?.length ?? 0), 0);
  if (totalHooks > 0) {
    log.info("hooks", `loaded ${totalHooks} hook(s) from ${path}`);
  }
  return compiled;
}
