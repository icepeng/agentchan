import { Database, type Statement } from "bun:sqlite";
import { randomInt } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import {
  getQuickJS,
  type QuickJSContext,
  type QuickJSHandle,
} from "quickjs-emscripten";

import { resolveInProject } from "../tools/_paths.js";

/**
 * Runs a user TypeScript/JavaScript file inside a QuickJS WASM sandbox.
 *
 * Isolation contract:
 *  - The user code evaluates in a fresh QuickJSContext with no access to
 *    host `fs`/`process`/`Bun`/`fetch`/`require`. Only the bridges explicitly
 *    installed below (`__host_*__`) are reachable, and every bridge routes
 *    path arguments through `resolveInProject` so a script cannot escape
 *    `projectDir`.
 *  - CPU and memory are bounded by `setMemoryLimit` + `setInterruptHandler`.
 *  - A SQLite `Database` never crosses the WASM boundary: scripts receive an
 *    integer handle id and the host keeps the real `Database` in a Map that
 *    is force-closed after the run regardless of success.
 *  - The user's `import ...` statements cannot reach any host module — the
 *    module loader only resolves the synthetic `__user__` name that carries
 *    the transpiled source itself.
 */

export interface ScriptRunOptions {
  timeoutMs: number;
  memoryLimitBytes?: number;
}

export interface ScriptRunResult {
  /** Normalized script output: string return passthrough, object → JSON, empty → "(no output)". */
  output: string;
  /** Human-readable error message if the script failed, otherwise null. */
  error: string | null;
}

interface SqliteState {
  db: Database;
  cache: Map<string, Statement>;
  inBatch: boolean;
}

const transpilerCache = new Map<"ts" | "js", Bun.Transpiler>();
function getTranspiler(loader: "ts" | "js"): Bun.Transpiler {
  let t = transpilerCache.get(loader);
  if (!t) {
    t = new Bun.Transpiler({ loader });
    transpilerCache.set(loader, t);
  }
  return t;
}

// Symbols shared between the host (bridge installer) and the prelude/entry
// templates. Collected here so PRELUDE/ENTRY strings and `installBridge` calls
// cannot drift out of sync — any rename is picked up by TypeScript at compile
// time instead of surfacing as a sandbox-runtime ReferenceError.
const USER_MODULE = "__user__";
const G_CTX = "__agentchan_ctx__";
const G_USER_FN = "__agentchan_user_fn__";
const G_ARGS_JSON = "__agentchan_args_json__";

const H_PROJECT_READ = "__host_project_read__";
const H_PROJECT_WRITE = "__host_project_write__";
const H_PROJECT_EXISTS = "__host_project_exists__";
const H_PROJECT_LISTDIR = "__host_project_listdir__";
const H_PROJECT_STAT = "__host_project_stat__";
const H_YAML_PARSE = "__host_yaml_parse__";
const H_YAML_STRINGIFY = "__host_yaml_stringify__";
const H_RANDOM_INT = "__host_random_int__";
const H_PARSE_ARGS = "__host_parse_args__";
const H_SQLITE_OPEN = "__host_sqlite_open__";
const H_SQLITE_EXEC = "__host_sqlite_exec__";
const H_SQLITE_ALL = "__host_sqlite_all__";
const H_SQLITE_RUN = "__host_sqlite_run__";
const H_SQLITE_BATCH_BEGIN = "__host_sqlite_batch_begin__";
const H_SQLITE_BATCH_COMMIT = "__host_sqlite_batch_commit__";
const H_SQLITE_BATCH_ROLLBACK = "__host_sqlite_batch_rollback__";
const H_SQLITE_CLOSE = "__host_sqlite_close__";

const PRELUDE = `(() => {
  function __make_sqlite_handle__(id) {
    return Object.freeze({
      exec: (sql) => { ${H_SQLITE_EXEC}(id, sql); },
      all: (sql, params) => JSON.parse(${H_SQLITE_ALL}(id, sql, JSON.stringify(params ?? []))),
      run: (sql, params) => JSON.parse(${H_SQLITE_RUN}(id, sql, JSON.stringify(params ?? []))),
      batch: (fn) => {
        ${H_SQLITE_BATCH_BEGIN}(id);
        try {
          fn();
          ${H_SQLITE_BATCH_COMMIT}(id);
        } catch (e) {
          ${H_SQLITE_BATCH_ROLLBACK}(id);
          throw e;
        }
      },
      close: () => { ${H_SQLITE_CLOSE}(id); },
    });
  }

  const ctx = Object.freeze({
    project: Object.freeze({
      readFile: (p) => ${H_PROJECT_READ}(p),
      writeFile: (p, c) => { ${H_PROJECT_WRITE}(p, c); },
      exists: (p) => ${H_PROJECT_EXISTS}(p),
      listDir: (p) => JSON.parse(${H_PROJECT_LISTDIR}(p)),
      stat: (p) => {
        const raw = ${H_PROJECT_STAT}(p);
        return raw === null ? null : JSON.parse(raw);
      },
    }),
    sqlite: Object.freeze({
      open: (p) => __make_sqlite_handle__(${H_SQLITE_OPEN}(p)),
    }),
    yaml: Object.freeze({
      parse: (text) => JSON.parse(${H_YAML_PARSE}(text)),
      stringify: (value) => ${H_YAML_STRINGIFY}(JSON.stringify(value)),
    }),
    random: Object.freeze({
      int: (min, max) => ${H_RANDOM_INT}(min, max),
    }),
    util: Object.freeze({
      parseArgs: (config) => JSON.parse(${H_PARSE_ARGS}(JSON.stringify(config))),
    }),
  });

  globalThis.${G_CTX} = ctx;

  // QuickJS has no event loop. Timer callbacks are flushed as microtasks so
  // that \`await new Promise(r => setTimeout(r, _))\` resolves in the same turn.
  globalThis.setTimeout = (cb) => { Promise.resolve().then(cb); return 0; };
  globalThis.clearTimeout = () => {};
})();`;

const ENTRY_IMPORT = `import userFn from "${USER_MODULE}";
globalThis.${G_USER_FN} = userFn;
`;

const ENTRY_INVOKE = `(() => {
  const userFn = globalThis.${G_USER_FN};
  if (typeof userFn !== "function") {
    throw new Error("must \\\`export default\\\` a function (args, ctx) => result");
  }
  const args = Object.freeze(JSON.parse(globalThis.${G_ARGS_JSON}));
  return userFn(args, globalThis.${G_CTX});
})();`;

export async function runScriptInQuickJS(
  projectDir: string,
  scriptPath: string,
  args: readonly string[],
  opts: ScriptRunOptions,
): Promise<ScriptRunResult> {
  let source: string;
  try {
    source = await Bun.file(scriptPath).text();
  } catch (err) {
    return {
      output: "(no output)",
      error: `cannot read ${scriptPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let transpiled: string;
  try {
    const loader: "ts" | "js" = scriptPath.endsWith(".ts") ? "ts" : "js";
    transpiled = getTranspiler(loader).transformSync(source);
  } catch (err) {
    return {
      output: "(no output)",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const quickjs = await getQuickJS();
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(opts.memoryLimitBytes ?? 64 * 1024 * 1024);

  const deadline = performance.now() + opts.timeoutMs;
  runtime.setInterruptHandler(() => performance.now() > deadline);

  const sqliteStates = new Map<number, SqliteState>();
  let nextHandleId = 1;

  const ctx: QuickJSContext = runtime.newContext();

  const getState = (id: number): SqliteState => {
    const st = sqliteStates.get(id);
    if (!st) throw new Error("sqlite handle closed");
    return st;
  };
  const prep = (st: SqliteState, sql: string): Statement => {
    let s = st.cache.get(sql);
    if (!s) {
      s = st.db.prepare(sql);
      st.cache.set(sql, s);
    }
    return s;
  };

  const installBridge = (name: string, impl: (...args: unknown[]) => unknown): void => {
    const fnHandle = ctx.newFunction(name, (...argHandles) => {
      if (performance.now() > deadline) {
        throw new Error(`Script timed out after ${opts.timeoutMs}ms`);
      }
      const rawArgs = argHandles.map((h) => ctx.dump(h));
      const result = impl(...rawArgs);
      return marshalReturn(ctx, result);
    });
    ctx.setProp(ctx.global, name, fnHandle);
    fnHandle.dispose();
  };

  installBridge(H_PROJECT_READ, (p) =>
    readFileSync(resolveInProject(projectDir, p as string), "utf-8"),
  );
  installBridge(H_PROJECT_WRITE, (p, c) => {
    writeFileSync(resolveInProject(projectDir, p as string), c as string, "utf-8");
  });
  installBridge(H_PROJECT_EXISTS, (p) =>
    existsSync(resolveInProject(projectDir, p as string)),
  );
  installBridge(H_PROJECT_LISTDIR, (p) =>
    readdirSync(resolveInProject(projectDir, p as string)),
  );
  installBridge(H_PROJECT_STAT, (p) => {
    try {
      const st = statSync(resolveInProject(projectDir, p as string));
      return { mtime: st.mtimeMs, size: st.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  });

  installBridge(H_YAML_PARSE, (text) => Bun.YAML.parse(text as string));
  installBridge(H_YAML_STRINGIFY, (jsonValue) =>
    Bun.YAML.stringify(JSON.parse(jsonValue as string)),
  );

  installBridge(H_RANDOM_INT, (min, max) =>
    randomInt(min as number, max as number),
  );

  installBridge(H_PARSE_ARGS, (configJson) => {
    const config = JSON.parse(configJson as string) as Parameters<typeof parseArgs>[0];
    return parseArgs(config);
  });

  installBridge(H_SQLITE_OPEN, (p) => {
    const dbPath = resolveInProject(projectDir, p as string);
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    const id = nextHandleId++;
    sqliteStates.set(id, { db, cache: new Map(), inBatch: false });
    return id;
  });
  installBridge(H_SQLITE_EXEC, (id, sql) => {
    getState(id as number).db.run(sql as string);
  });
  installBridge(H_SQLITE_ALL, (id, sql, paramsJson) => {
    const st = getState(id as number);
    const params = JSON.parse(paramsJson as string) as unknown[];
    return prep(st, sql as string).all(...params);
  });
  installBridge(H_SQLITE_RUN, (id, sql, paramsJson) => {
    const st = getState(id as number);
    const params = JSON.parse(paramsJson as string) as unknown[];
    const res = prep(st, sql as string).run(...params);
    return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
  });
  installBridge(H_SQLITE_BATCH_BEGIN, (id) => {
    const st = getState(id as number);
    if (st.inBatch) throw new Error("nested batch not supported");
    st.db.run("BEGIN");
    st.inBatch = true;
  });
  installBridge(H_SQLITE_BATCH_COMMIT, (id) => {
    const st = getState(id as number);
    st.db.run("COMMIT");
    st.inBatch = false;
  });
  installBridge(H_SQLITE_BATCH_ROLLBACK, (id) => {
    const st = getState(id as number);
    try {
      st.db.run("ROLLBACK");
    } catch {
      // best effort — batch may not have actually begun
    }
    st.inBatch = false;
  });
  installBridge(H_SQLITE_CLOSE, (id) => {
    const st = sqliteStates.get(id as number);
    if (!st) return;
    for (const stmt of st.cache.values()) {
      try {
        stmt.finalize();
      } catch {
        // fine
      }
    }
    st.cache.clear();
    st.db.close();
    sqliteStates.delete(id as number);
  });

  const argsJsonHandle = ctx.newString(JSON.stringify([...args]));
  ctx.setProp(ctx.global, G_ARGS_JSON, argsJsonHandle);
  argsJsonHandle.dispose();

  const preludeResult = ctx.evalCode(PRELUDE, "<prelude>");
  if (preludeResult.error) {
    const msg = describeHandleError(ctx, preludeResult.error);
    preludeResult.error.dispose();
    cleanup();
    return { output: "(no output)", error: `prelude failed: ${msg}` };
  }
  preludeResult.value.dispose();

  runtime.setModuleLoader((name) => {
    if (name === USER_MODULE) return transpiled;
    return { error: new Error(`imports are not allowed in sandboxed scripts: ${name}`) };
  });

  try {
    const importResult = ctx.evalCode(ENTRY_IMPORT, "entry-import.mjs", { type: "module" });
    if (importResult.error) {
      const msg = describeHandleError(ctx, importResult.error);
      importResult.error.dispose();
      return { output: "(no output)", error: normalizeErrorMessage(msg, opts.timeoutMs, deadline) };
    }
    importResult.value.dispose();

    const pending = runtime.executePendingJobs();
    if (pending.error) {
      const msg = describeHandleError(ctx, pending.error);
      pending.error.dispose();
      return { output: "(no output)", error: normalizeErrorMessage(msg, opts.timeoutMs, deadline) };
    }

    const invokeResult = ctx.evalCode(ENTRY_INVOKE, "entry-invoke.js");
    if (invokeResult.error) {
      const msg = describeHandleError(ctx, invokeResult.error);
      invokeResult.error.dispose();
      return { output: "(no output)", error: normalizeErrorMessage(msg, opts.timeoutMs, deadline) };
    }

    // The invoke expression evaluates to the user function's return value —
    // might be a plain value or a Promise if the user declared `async`.
    const returnHandle = invokeResult.value;
    let resultHandle: QuickJSHandle;
    let state = ctx.getPromiseState(returnHandle);

    // Drain pending jobs until the promise settles. The sync variant of
    // quickjs-emscripten does not auto-drive pending jobs inside
    // `resolvePromise`, so we poll executePendingJobs ourselves and re-check.
    while (state.type === "pending") {
      if (performance.now() > deadline) {
        returnHandle.dispose();
        return {
          output: "(no output)",
          error: `Script timed out after ${opts.timeoutMs}ms`,
        };
      }
      const exec = runtime.executePendingJobs();
      if (exec.error) {
        const msg = describeHandleError(ctx, exec.error);
        exec.error.dispose();
        returnHandle.dispose();
        return { output: "(no output)", error: normalizeErrorMessage(msg, opts.timeoutMs, deadline) };
      }
      state = ctx.getPromiseState(returnHandle);
      if (state.type === "pending" && exec.value === 0) {
        // No more jobs queued but promise still pending — this indicates the
        // user script awaited a promise that no host capability can settle.
        returnHandle.dispose();
        return {
          output: "(no output)",
          error: "script awaited a promise that never resolved",
        };
      }
    }

    if (state.type === "fulfilled") {
      if (state.notAPromise) {
        // The user returned a plain value — returnHandle *is* that value.
        resultHandle = returnHandle;
      } else {
        resultHandle = state.value;
        returnHandle.dispose();
      }
    } else {
      // rejected
      const msg = describeHandleError(ctx, state.error);
      state.error.dispose();
      returnHandle.dispose();
      return { output: "(no output)", error: normalizeErrorMessage(msg, opts.timeoutMs, deadline) };
    }

    const result = ctx.dump(resultHandle);
    resultHandle.dispose();

    if (result === undefined || result === null) {
      return { output: "(no output)", error: null };
    }
    if (typeof result === "string") {
      return { output: result, error: null };
    }
    return { output: JSON.stringify(result), error: null };
  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    return { output: "(no output)", error: normalizeErrorMessage(msg, opts.timeoutMs, deadline) };
  } finally {
    cleanup();
  }

  function cleanup(): void {
    for (const [, st] of sqliteStates) {
      if (st.inBatch) {
        try {
          st.db.run("ROLLBACK");
        } catch {
          // fine — the batch may have already errored out
        }
      }
      for (const stmt of st.cache.values()) {
        try {
          stmt.finalize();
        } catch {
          // fine
        }
      }
      st.cache.clear();
      try {
        st.db.close();
      } catch {
        // fine
      }
    }
    sqliteStates.clear();

    try {
      ctx.dispose();
    } catch {
      // fine
    }
    try {
      runtime.dispose();
    } catch {
      // fine
    }
  }
}

function marshalReturn(ctx: QuickJSContext, value: unknown): QuickJSHandle {
  if (value === undefined) return ctx.undefined;
  if (value === null) return ctx.null;
  if (typeof value === "string") return ctx.newString(value);
  if (typeof value === "number") return ctx.newNumber(value);
  if (typeof value === "boolean") return value ? ctx.true : ctx.false;
  if (typeof value === "bigint") return ctx.newNumber(Number(value));
  // Arrays/objects cross as a JSON string — every prelude consumer parses it.
  return ctx.newString(JSON.stringify(value, bigintReplacer));
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? Number(value) : value;
}

function describeHandleError(ctx: QuickJSContext, handle: QuickJSHandle): string {
  try {
    const dumped = ctx.dump(handle);
    if (typeof dumped === "string") return dumped;
    if (dumped && typeof dumped === "object") {
      const obj = dumped as { message?: string; stack?: string; name?: string };
      const name = obj.name ?? "Error";
      const head = obj.message ? `${name}: ${obj.message}` : name;
      return obj.stack ? `${head}\n${obj.stack}` : head;
    }
    return String(dumped);
  } catch {
    return "<error details unavailable>";
  }
}

function normalizeErrorMessage(raw: string, timeoutMs: number, deadline: number): string {
  if (performance.now() > deadline) {
    return `Script timed out after ${timeoutMs}ms`;
  }
  const lower = raw.toLowerCase();
  if (lower.includes("interrupt")) {
    return `Script timed out after ${timeoutMs}ms`;
  }
  if (lower.includes("out of memory")) {
    return "Script exceeded memory limit";
  }
  return raw;
}
