import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createScriptTool } from "../../src/tools/script.js";

let tempDir: string;
let tool: ReturnType<typeof createScriptTool>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "script-test-"));
  tool = createScriptTool(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeScript(name: string, body: string): Promise<string> {
  const filePath = join(tempDir, name);
  await writeFile(filePath, body, "utf-8");
  return name;
}

async function run(file: string, args: string[] = [], timeout?: number): Promise<string> {
  const result = await tool.execute("test-call", { file, args, ...(timeout ? { timeout } : {}) });
  return (result.content[0] as { text: string }).text;
}

describe("call signature", () => {
  test("args reach the script as the first parameter", async () => {
    await writeScript("a.ts", `
      export default function (args, _ctx) {
        return { received: [...args], length: args.length };
      }
    `);
    const out = await run("a.ts", ["--foo", "bar", "baz"]);
    expect(out).toBe('{"received":["--foo","bar","baz"],"length":3}');
  });

  test("missing args yields empty array", async () => {
    await writeScript("a.ts", `
      export default function (args, _ctx) {
        return { length: args.length };
      }
    `);
    const out = await run("a.ts");
    expect(out).toBe('{"length":0}');
  });

  test("default export must be a function", async () => {
    await writeScript("a.ts", `export default { not: "a function" };`);
    const out = await run("a.ts");
    expect(out).toContain("must `export default` a function");
  });
});

describe("return value handling", () => {
  test("string return is passed through unchanged", async () => {
    await writeScript("a.ts", `export default () => "hello world";`);
    expect(await run("a.ts")).toBe("hello world");
  });

  test("object return is JSON.stringify'd (single line)", async () => {
    await writeScript("a.ts", `export default () => ({ ok: true, items: [1, 2, 3] });`);
    expect(await run("a.ts")).toBe('{"ok":true,"items":[1,2,3]}');
  });

  test("void return yields (no output)", async () => {
    await writeScript("a.ts", `export default () => {};`);
    expect(await run("a.ts")).toBe("(no output)");
  });

  test("async default is awaited", async () => {
    await writeScript("a.ts", `
      export default async function (_args, _ctx) {
        await new Promise((r) => setTimeout(r, 1));
        return { done: true };
      }
    `);
    expect(await run("a.ts")).toBe('{"done":true}');
  });
});

describe("error handling", () => {
  test("throw Error surfaces the message", async () => {
    await writeScript("a.ts", `
      export default () => { throw new Error("something broke"); };
    `);
    const out = await run("a.ts");
    expect(out).toContain("Error: ");
    expect(out).toContain("something broke");
  });

  test("host module imports are rejected by the sandbox", async () => {
    await writeScript("a.ts", `import "node:fs";\nexport default () => "ok";`);
    const out = await run("a.ts");
    expect(out).toContain("imports are not allowed");
  });

  test("timeout aborts a runaway loop", async () => {
    await writeScript("a.ts", `export default () => { while (true) {} };`);
    const out = await run("a.ts", [], 500);
    expect(out).toContain("Script timed out after 500ms");
  });

  test("host globals (Bun/process/fetch) are absent from the sandbox", async () => {
    // `typeof require` is intentionally omitted — Bun.Transpiler inlines it
    // to the literal `"function"` regardless of the runtime environment.
    await writeScript("a.ts", `
      export default () => ({
        bun: typeof Bun,
        process: typeof process,
        fetch: typeof fetch,
      });
    `);
    const out = await run("a.ts");
    expect(JSON.parse(out)).toEqual({
      bun: "undefined",
      process: "undefined",
      fetch: "undefined",
    });
  });
});

describe("ctx.project", () => {
  test("readFile reads project-relative text", async () => {
    await writeFile(join(tempDir, "data.txt"), "payload-content", "utf-8");
    await writeScript("r.ts", `
      export default (_args, ctx) => ctx.project.readFile("data.txt");
    `);
    expect(await run("r.ts")).toBe("payload-content");
  });

  test("writeFile + exists + listDir round trip", async () => {
    await writeScript("w.ts", `
      export default (_args, ctx) => {
        ctx.project.writeFile("out.txt", "abc");
        return {
          exists: ctx.project.exists("out.txt"),
          missing: ctx.project.exists("nope.txt"),
          dir: ctx.project.listDir(".").sort(),
        };
      };
    `);
    const out = await run("w.ts");
    const parsed = JSON.parse(out);
    expect(parsed.exists).toBe(true);
    expect(parsed.missing).toBe(false);
    expect(parsed.dir).toContain("out.txt");
    expect(parsed.dir).toContain("w.ts");
    expect(await readFile(join(tempDir, "out.txt"), "utf-8")).toBe("abc");
  });

  test("listDir on a subdirectory", async () => {
    await mkdir(join(tempDir, "sub"));
    await writeFile(join(tempDir, "sub", "x.md"), "x");
    await writeFile(join(tempDir, "sub", "y.md"), "y");
    await writeScript("l.ts", `
      export default (_args, ctx) => ctx.project.listDir("sub").sort();
    `);
    expect(await run("l.ts")).toBe('["x.md","y.md"]');
  });
});

describe("ctx.project.stat", () => {
  test("returns mtime + size for an existing file", async () => {
    await writeFile(join(tempDir, "meta.txt"), "hello", "utf-8");
    await writeScript("s.ts", `
      export default (_args, ctx) => {
        const s = ctx.project.stat("meta.txt");
        return s === null ? "null" : { size: s.size, hasMtime: typeof s.mtime === "number" && s.mtime > 0 };
      };
    `);
    const out = await run("s.ts");
    expect(JSON.parse(out)).toEqual({ size: 5, hasMtime: true });
  });

  test("returns null for a missing file", async () => {
    await writeScript("s.ts", `
      export default (_args, ctx) => {
        const s = ctx.project.stat("nope.txt");
        return { isNull: s === null };
      };
    `);
    expect(JSON.parse(await run("s.ts"))).toEqual({ isNull: true });
  });

  test("detects mtime change after rewrite", async () => {
    const p = join(tempDir, "meta.txt");
    await writeFile(p, "v1", "utf-8");
    await writeScript("s.ts", `
      export default (_args, ctx) => {
        const a = ctx.project.stat("meta.txt");
        ctx.project.writeFile("meta.txt", "version-two");
        const b = ctx.project.stat("meta.txt");
        return { sizeA: a.size, sizeB: b.size, grew: b.size > a.size };
      };
    `);
    const parsed = JSON.parse(await run("s.ts"));
    expect(parsed.sizeA).toBe(2);
    expect(parsed.sizeB).toBe(11);
    expect(parsed.grew).toBe(true);
  });
});

describe("ctx.sqlite", () => {
  test("open + exec + run + all (basic CRUD)", async () => {
    await writeScript("db.ts", `
      export default (_args, ctx) => {
        const db = ctx.sqlite.open("store.db");
        try {
          db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
          db.run("INSERT INTO items (name) VALUES (?)", ["alpha"]);
          db.run("INSERT INTO items (name) VALUES (?)", ["beta"]);
          const rows = db.all("SELECT name FROM items ORDER BY id");
          return rows.map((r) => r.name);
        } finally {
          db.close();
        }
      };
    `);
    expect(JSON.parse(await run("db.ts"))).toEqual(["alpha", "beta"]);
  });

  test("batch commits on success", async () => {
    await writeScript("db.ts", `
      export default (_args, ctx) => {
        const db = ctx.sqlite.open("store.db");
        try {
          db.exec("CREATE TABLE t (x INT)");
          db.batch(() => {
            db.run("INSERT INTO t VALUES (?)", [1]);
            db.run("INSERT INTO t VALUES (?)", [2]);
          });
          return db.all("SELECT x FROM t ORDER BY x").map((r) => r.x);
        } finally {
          db.close();
        }
      };
    `);
    expect(JSON.parse(await run("db.ts"))).toEqual([1, 2]);
  });

  test("batch rolls back on throw", async () => {
    await writeScript("db.ts", `
      export default (_args, ctx) => {
        const db = ctx.sqlite.open("store.db");
        try {
          db.exec("CREATE TABLE t (x INT)");
          db.run("INSERT INTO t VALUES (?)", [100]);
          try {
            db.batch(() => {
              db.run("INSERT INTO t VALUES (?)", [200]);
              throw new Error("rollback me");
            });
          } catch (_e) { /* swallow */ }
          return db.all("SELECT x FROM t ORDER BY x").map((r) => r.x);
        } finally {
          db.close();
        }
      };
    `);
    expect(JSON.parse(await run("db.ts"))).toEqual([100]);
  });

  test("open refuses a path outside the project", async () => {
    await writeScript("db.ts", `
      export default (_args, ctx) => {
        ctx.sqlite.open("../escape.db");
      };
    `);
    const out = await run("db.ts");
    expect(out).toContain("path outside project");
  });

  test("leaked handle is force-closed by the host (next run reopens cleanly)", async () => {
    await writeScript("leak.ts", `
      export default (_args, ctx) => {
        const db = ctx.sqlite.open("leak.db");
        db.exec("CREATE TABLE IF NOT EXISTS t (x INT)");
        db.run("INSERT INTO t VALUES (?)", [42]);
        // intentionally forget to close
      };
    `);
    expect(await run("leak.ts")).toBe("(no output)");

    await writeScript("read.ts", `
      export default (_args, ctx) => {
        const db = ctx.sqlite.open("leak.db");
        try {
          return db.all("SELECT x FROM t").map((r) => r.x);
        } finally {
          db.close();
        }
      };
    `);
    expect(JSON.parse(await run("read.ts"))).toEqual([42]);
  });
});

describe("ctx.yaml", () => {
  test("parse and stringify round trip", async () => {
    await writeScript("y.ts", `
      export default (_args, ctx) => {
        const value = { a: [1, "b", null], nested: { k: true } };
        const text = ctx.yaml.stringify(value);
        const back = ctx.yaml.parse(text);
        return back;
      };
    `);
    const out = await run("y.ts");
    expect(JSON.parse(out)).toEqual({ a: [1, "b", null], nested: { k: true } });
  });
});

describe("ctx.util.parseArgs", () => {
  test("parses named string options + positionals", async () => {
    await writeScript("p.ts", `
      export default (args, ctx) => {
        const { values, positionals } = ctx.util.parseArgs({
          args: [...args],
          options: {
            actor: { type: "string" },
            "target-dc": { type: "string" },
            "skip-cooldown": { type: "boolean" },
          },
          strict: true,
          allowPositionals: true,
        });
        return { values, positionals };
      };
    `);
    const out = await run("p.ts", ["title", "--actor", "pc", "--target-dc", "12", "--skip-cooldown", "tail"]);
    const parsed = JSON.parse(out);
    expect(parsed.values).toEqual({ actor: "pc", "target-dc": "12", "skip-cooldown": true });
    expect(parsed.positionals).toEqual(["title", "tail"]);
  });

  test("strict: true rejects unknown flags", async () => {
    await writeScript("p.ts", `
      export default (args, ctx) => {
        return ctx.util.parseArgs({
          args: [...args],
          options: { known: { type: "string" } },
          strict: true,
        });
      };
    `);
    const out = await run("p.ts", ["--unknown", "x"]);
    expect(out).toContain("Unknown option");
  });
});

describe("ctx.random", () => {
  test("int returns values within [min, max)", async () => {
    await writeScript("rand.ts", `
      export default (_args, ctx) => {
        const samples = [];
        for (let i = 0; i < 200; i++) samples.push(ctx.random.int(1, 7));
        return {
          min: Math.min(...samples),
          max: Math.max(...samples),
        };
      };
    `);
    const out = await run("rand.ts");
    const parsed = JSON.parse(out);
    expect(parsed.min).toBeGreaterThanOrEqual(1);
    expect(parsed.max).toBeLessThanOrEqual(6);
  });
});

describe("path containment", () => {
  test("ctx.project.readFile refuses ../ escape", async () => {
    await writeScript("escape.ts", `
      export default function (_args, ctx) {
        ctx.project.readFile("../outside.txt");
      }
    `);
    const out = await run("escape.ts");
    expect(out).toContain("path outside project");
  });

  test("tool refuses to run a script outside the project dir", async () => {
    await expect(
      tool.execute("test-call", { file: "../escape.ts", args: [] }),
    ).rejects.toThrow(/path outside project/);
  });
});

describe("integration — combat-style script", () => {
  test("write a stat block, mutate it, read it back", async () => {
    await mkdir(join(tempDir, "files"));
    await writeFile(
      join(tempDir, "files", "party.yaml"),
      "pc:\n  hp: { current: 20, max: 20 }\n",
      "utf-8",
    );
    await writeScript("combat.ts", `
      export default function (args, ctx) {
        const damage = parseInt(args[0], 10);
        const raw = ctx.project.readFile("files/party.yaml");
        const data = ctx.yaml.parse(raw);
        const newHp = Math.max(0, data.pc.hp.current - damage);
        const updated = raw.replace(
          /(hp:\\s*\\{\\s*current:\\s*)\\d+/,
          \`$1\${newHp}\`,
        );
        ctx.project.writeFile("files/party.yaml", updated);
        return {
          changed: ["files/party.yaml"],
          deltas: { hp: { from: data.pc.hp.current, to: newHp } },
        };
      }
    `);
    const out = await run("combat.ts", ["5"]);
    const parsed = JSON.parse(out);
    expect(parsed.changed).toEqual(["files/party.yaml"]);
    expect(parsed.deltas.hp.to).toBe(15);
    const written = await readFile(join(tempDir, "files", "party.yaml"), "utf-8");
    expect(written).toContain("current: 15");
  });
});
