import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Database, type Statement } from "bun:sqlite";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { resolveInProject } from "../tools/_paths.js";

/**
 * Capability surface exposed to user scripts. All access to the host
 * environment goes through this object — `fs`, `process`, `Bun`, `fetch`,
 * `require` are not available inside the script function body.
 *
 * `project.*` paths are lexically contained to `projectDir` via
 * `resolveInProject` (same helper the other tools use).
 *
 * Every method here must be reachable over a structured-clone RPC bridge:
 * arguments and return values use only plain data (string/number/boolean/
 * bigint/array/object). That constraint lets phase 2 swap the runtime to
 * `quickjs-emscripten` without changing user-visible script APIs — the host
 * will proxy each call through the bridge instead of executing it in-process.
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

// Internal: tracks open sqlite handles per context so the host can force-close
// them after the script run, even if the user script forgot to call close().
const openHandles = new WeakMap<ScriptContext, Set<SqliteHandle>>();

export function createScriptContext(projectDir: string): ScriptContext {
  const join = (p: string) => resolveInProject(projectDir, p);
  const handles = new Set<SqliteHandle>();

  const ctx: ScriptContext = {
    project: {
      readFile: (p) => readFileSync(join(p), "utf-8"),
      writeFile: (p, content) => writeFileSync(join(p), content, "utf-8"),
      exists: (p) => existsSync(join(p)),
      listDir: (p) => readdirSync(join(p)),
      stat: (p) => {
        try {
          const st = statSync(join(p));
          return { mtime: st.mtimeMs, size: st.size };
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw err;
        }
      },
    },
    sqlite: {
      open: (p) => {
        const dbPath = join(p);
        mkdirSync(dirname(dbPath), { recursive: true });
        const db = new Database(dbPath);
        const cache = new Map<string, Statement>();
        const prep = (sql: string): Statement => {
          let s = cache.get(sql);
          if (!s) {
            s = db.prepare(sql);
            cache.set(sql, s);
          }
          return s;
        };
        const handle: SqliteHandle = {
          exec: (sql) => {
            db.exec(sql);
          },
          all: <T>(sql: string, params?: readonly unknown[]): T[] => {
            return prep(sql).all(...((params ?? []) as unknown[])) as T[];
          },
          run: (sql, params) => {
            const res = prep(sql).run(...((params ?? []) as unknown[]));
            return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
          },
          batch: (fn) => {
            db.transaction(fn)();
          },
          close: () => {
            if (!handles.has(handle)) return;
            handles.delete(handle);
            cache.clear();
            db.close();
          },
        };
        handles.add(handle);
        return handle;
      },
    },
    yaml: {
      parse: (text) => Bun.YAML.parse(text),
      stringify: (value) => Bun.YAML.stringify(value),
    },
    random: {
      int: (min, max) => randomInt(min, max),
    },
    util: { parseArgs },
  };

  openHandles.set(ctx, handles);
  return ctx;
}

/**
 * Force-closes any sqlite handles still open on `ctx`. Call this after the
 * user script returns (or throws) to guarantee file descriptors are released
 * before the process exits — useful when scripts leak a handle.
 */
export function disposeScriptContext(ctx: ScriptContext): void {
  const handles = openHandles.get(ctx);
  if (!handles) return;
  for (const h of [...handles]) {
    try {
      h.close();
    } catch {
      // best effort — one bad handle shouldn't block the rest
    }
  }
  handles.clear();
}
