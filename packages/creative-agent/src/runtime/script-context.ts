import type { parseArgs } from "node:util";

/**
 * Capability surface exposed to user scripts inside the QuickJS WASM sandbox.
 *
 * Template scripts reach this contract via `import type { ScriptContext }
 * from "@agentchan/creative-agent"` — the runtime implementation lives in
 * `quickjs-runner.ts`, which wires each member to a host bridge that applies
 * `resolveInProject` before touching the filesystem.
 *
 * All arguments and return values are plain data (string/number/boolean/
 * bigint/array/object) because they must round-trip through a structured-
 * clone RPC bridge between the host and the sandbox.
 */
export interface ProjectScope {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
  listDir(path: string): string[];
  /**
   * Returns `mtime` (ms since epoch) and `size` (bytes). `null` if the path
   * does not exist; other errors throw.
   */
  stat(path: string): { mtime: number; size: number } | null;
}

export interface SqliteScope {
  /**
   * Opens (or creates) a sqlite DB at the project-relative path. The file
   * and its parent directory are created if missing.
   *
   * Handles are tracked by the host and force-closed after the script run
   * returns, so leaking a handle does not leak file descriptors across runs.
   * Callers should still call `close()` explicitly when done.
   */
  open(relativePath: string): SqliteHandle;
}

export interface SqliteHandle {
  exec(sql: string): void;
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): T[];
  run(
    sql: string,
    params?: readonly unknown[],
  ): { changes: number; lastInsertRowid: number | bigint };
  /**
   * Runs `fn` inside a single transaction. Only `exec`/`all`/`run` calls on
   * this same handle are allowed inside — nested `batch` is not supported.
   * Throwing rolls back.
   */
  batch(fn: () => void): void;
  close(): void;
}

export interface ScriptContext {
  readonly project: ProjectScope;
  readonly sqlite: SqliteScope;
  readonly yaml: {
    parse(text: string): unknown;
    stringify(value: unknown): string;
  };
  readonly random: {
    int(minInclusive: number, maxExclusive: number): number;
  };
  readonly util: {
    /**
     * `node:util.parseArgs` 1:1 — same overloads, same type inference from
     * `options` schema. Pass `{args, options, strict, allowPositionals}`.
     */
    parseArgs: typeof parseArgs;
  };
}

export type ScriptResult = string | object | void;
