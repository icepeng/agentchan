import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { textResult } from "../tool-result.js";
import { resolveInProject } from "./_paths.js";
import { truncateTail } from "./util.js";

const ScriptParams = Type.Object({
  file: Type.String({
    description:
      "Path to the .ts/.js/.mjs file to run, relative to the project directory.",
  }),
  args: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Arguments passed to the script. Each element becomes one entry — no shell quoting needed.",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({ description: "Timeout in milliseconds (default: 120000)" }),
  ),
});

type ScriptInput = Static<typeof ScriptParams>;

const DESCRIPTION = `Run a TypeScript or JavaScript file from the project directory.

Usage:
- file: path relative to the project root (e.g. "scripts/word-count.ts"). Must be a .ts, .js, or .mjs file that exists in the project.
- args: array of strings passed to the script. Each element becomes one argument, with no shell quoting or escaping needed.
- timeout: milliseconds before the script is killed (default: 120000).

The script runs with cwd set to the project root. Captured stdout and stderr are returned together; non-zero exit codes are surfaced. Output is truncated to roughly the last 50KB / 2000 lines.`;

/**
 * Wrapper source executed inside the spawned Bun process. Self-contained
 * (no imports of agentchan internals) so it works under both dev (`bun run`)
 * and `bun --compile` single-executable, where the parent's import graph
 * is not visible to the child.
 *
 * Mirrors `runtime/script-context.ts` — keep the two in sync if either
 * changes. The duplication is intentional: dev/test exercises the host
 * implementation, the spawned child re-creates an equivalent context
 * inside its own process.
 */
const SCRIPT_RUNNER_SOURCE = `import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative, sep, isAbsolute } from "node:path";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

function resolveInProject(projectDir, userPath) {
  const abs = resolve(projectDir, userPath);
  const rel = relative(projectDir, abs);
  if (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel))
  ) {
    return abs;
  }
  throw new Error(\`path outside project: \${userPath}\`);
}

function createScriptContext(projectDir) {
  const join = (p) => resolveInProject(projectDir, p);
  const handles = new Set();
  const ctx = {
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
          if (err && err.code === "ENOENT") return null;
          throw err;
        }
      },
    },
    sqlite: {
      open: (p) => {
        const dbPath = join(p);
        mkdirSync(dirname(dbPath), { recursive: true });
        const db = new Database(dbPath);
        const cache = new Map();
        const prep = (sql) => {
          let s = cache.get(sql);
          if (!s) {
            s = db.prepare(sql);
            cache.set(sql, s);
          }
          return s;
        };
        const handle = {
          exec: (sql) => { db.exec(sql); },
          all: (sql, params) => prep(sql).all(...(params ?? [])),
          run: (sql, params) => {
            const res = prep(sql).run(...(params ?? []));
            return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
          },
          batch: (fn) => { db.transaction(fn)(); },
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
    util: {
      parseArgs: (config) => parseArgs(config),
    },
  };
  const dispose = () => {
    for (const h of [...handles]) {
      try { h.close(); } catch {}
    }
    handles.clear();
  };
  return { ctx, dispose };
}

const userScriptPath = process.argv[2];
const args = Object.freeze(process.argv.slice(3));

if (!userScriptPath) {
  process.stderr.write("script-runner: missing user script path\\n");
  process.exit(2);
}

const { ctx, dispose } = createScriptContext(process.cwd());

try {
  const mod = await import(pathToFileURL(userScriptPath).href);
  const fn = mod.default;
  if (typeof fn !== "function") {
    process.stderr.write(\`script-runner: \${userScriptPath} must \\\`export default\\\` a function (args, ctx) => result\\n\`);
    process.exit(2);
  }
  const result = await fn(args, ctx);
  if (result === undefined || result === null) {
    // void → no output
  } else if (typeof result === "string") {
    process.stdout.write(result);
  } else {
    process.stdout.write(JSON.stringify(result));
  }
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(\`Error: \${message}\\n\`);
  process.exit(1);
} finally {
  dispose();
}
`;

let cachedRunnerPath: Promise<string> | null = null;

async function getRunnerPath(): Promise<string> {
  if (!cachedRunnerPath) {
    cachedRunnerPath = (async () => {
      const dir = await mkdtemp(join(tmpdir(), "agentchan-script-runner-"));
      const runnerPath = join(dir, "runner.mjs");
      await writeFile(runnerPath, SCRIPT_RUNNER_SOURCE, "utf-8");
      return runnerPath;
    })();
  }
  return cachedRunnerPath;
}

/**
 * Run a TypeScript/JavaScript file using the bundled Bun runtime.
 *
 * Spawns `bun run <runner> <userScript> <...args>`. The runner imports the
 * user script and calls its default export with `(args, ctx)`, where ctx
 * exposes only the capabilities defined in `runtime/script-context.ts`.
 *
 * In dev mode `process.execPath` is the user's `bun` binary; in a `bun --compile`
 * single executable it is the compiled exe itself, which when invoked with
 * `BUN_BE_BUN=1` exposes the full Bun CLI. Either way the same spawn command
 * works — no separate Bun installation is required for end users.
 */
export function createScriptTool(cwd?: string): AgentTool<typeof ScriptParams, void> {
  const workDir = cwd ?? process.cwd();

  return {
    name: "script",
    description: DESCRIPTION,
    parameters: ScriptParams,
    label: "Run script",

    async execute(
      _toolCallId: string,
      params: ScriptInput,
    ): Promise<AgentToolResult<void>> {
      const { file, args = [], timeout: timeoutMs = 120_000 } = params;
      const scriptPath = resolveInProject(workDir, file);
      const runnerPath = await getRunnerPath();

      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(
          [process.execPath, "run", runnerPath, scriptPath, ...args],
          {
            cwd: workDir,
            stdout: "pipe",
            stderr: "pipe",
            env: { ...process.env, BUN_BE_BUN: "1" },
          },
        );
      } catch {
        return textResult("Error: Could not spawn script process.");
      }

      let timerId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          proc.kill();
          reject(new Error(`Script timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const resultPromise = (async () => {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout as ReadableStream).text(),
          new Response(proc.stderr as ReadableStream).text(),
          proc.exited,
        ]);

        let output = "";
        if (stdout) output += stdout;
        if (stderr) output += (output ? "\n" : "") + `[stderr] ${stderr}`;
        if (exitCode !== 0) output += `\n[exit code: ${exitCode}]`;

        if (!output) return "(no output)";

        const { text } = truncateTail(output);
        return text;
      })();

      try {
        return textResult(await Promise.race([resultPromise, timeoutPromise]));
      } finally {
        clearTimeout(timerId!);
      }
    },
  };
}
