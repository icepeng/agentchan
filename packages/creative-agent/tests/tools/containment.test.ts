import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReadTool } from "../../src/tools/read.js";
import { createWriteTool } from "../../src/tools/write.js";
import { createAppendTool } from "../../src/tools/append.js";
import { createEditTool } from "../../src/tools/edit.js";
import { createGrepTool } from "../../src/tools/grep.js";
import { createTreeTool } from "../../src/tools/tree.js";
import { createScriptTool } from "../../src/tools/script.js";

let project: string;
let outside: string;
let secretRel: string;

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), "containment-"));
  project = join(base, "project");
  outside = join(base, "outside");
  await mkdir(project, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "secret.txt"), "TOP_SECRET", "utf-8");
  await writeFile(join(project, "ok.txt"), "in-project", "utf-8");
  secretRel = "../outside/secret.txt";
});

afterEach(async () => {
  await rm(join(project, ".."), { recursive: true, force: true });
});

const ABSOLUTE_TARGET =
  process.platform === "win32"
    ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
    : "/etc/passwd";

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe("read 도구", () => {
  test("정상 in-project 파일은 읽힘", async () => {
    const tool = createReadTool(project);
    const r = await tool.execute("c", { file_path: "ok.txt" });
    expect(JSON.stringify(r.content)).toContain("in-project");
  });

  test("../ escape는 throw", async () => {
    const tool = createReadTool(project);
    await expect(tool.execute("c", { file_path: secretRel })).rejects.toThrow(
      /path outside project/,
    );
  });

  test("절대경로는 throw", async () => {
    const tool = createReadTool(project);
    await expect(
      tool.execute("c", { file_path: ABSOLUTE_TARGET }),
    ).rejects.toThrow(/path outside project/);
  });
});

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

describe("write 도구", () => {
  test("정상 in-project 파일은 쓰임", async () => {
    const tool = createWriteTool(project);
    const r = await tool.execute("c", {
      file_path: "new.txt",
      content: "hello",
    });
    expect(JSON.stringify(r.content)).toContain("File written");
  });

  test("../ escape는 throw", async () => {
    const tool = createWriteTool(project);
    await expect(
      tool.execute("c", { file_path: "../outside/leak.txt", content: "x" }),
    ).rejects.toThrow(/path outside project/);
  });

  test("절대경로는 throw", async () => {
    const tool = createWriteTool(project);
    await expect(
      tool.execute("c", { file_path: ABSOLUTE_TARGET, content: "x" }),
    ).rejects.toThrow(/path outside project/);
  });
});

// ---------------------------------------------------------------------------
// append
// ---------------------------------------------------------------------------

describe("append 도구", () => {
  test("정상 in-project 파일은 append됨", async () => {
    const tool = createAppendTool(project);
    const r = await tool.execute("c", {
      file_path: "ok.txt",
      content: "+more",
    });
    expect(JSON.stringify(r.content)).toContain("Content appended");
  });

  test("../ escape는 throw", async () => {
    const tool = createAppendTool(project);
    await expect(
      tool.execute("c", { file_path: secretRel, content: "x" }),
    ).rejects.toThrow(/path outside project/);
  });

  test("절대경로는 throw", async () => {
    const tool = createAppendTool(project);
    await expect(
      tool.execute("c", { file_path: ABSOLUTE_TARGET, content: "x" }),
    ).rejects.toThrow(/path outside project/);
  });
});

// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

describe("edit 도구", () => {
  test("정상 in-project 파일은 편집됨", async () => {
    const tool = createEditTool(project);
    const r = await tool.execute("c", {
      file_path: "ok.txt",
      old_string: "in-project",
      new_string: "edited",
    });
    expect(JSON.stringify(r.content)).toContain("File edited");
  });

  test("../ escape는 throw", async () => {
    const tool = createEditTool(project);
    await expect(
      tool.execute("c", {
        file_path: secretRel,
        old_string: "TOP",
        new_string: "X",
      }),
    ).rejects.toThrow(/path outside project/);
  });

  test("절대경로는 throw", async () => {
    const tool = createEditTool(project);
    await expect(
      tool.execute("c", {
        file_path: ABSOLUTE_TARGET,
        old_string: "x",
        new_string: "y",
      }),
    ).rejects.toThrow(/path outside project/);
  });
});

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

describe("grep 도구", () => {
  test("path 미지정 시 정상 검색", async () => {
    const tool = createGrepTool(project);
    const r = await tool.execute("c", { pattern: "in-project" });
    expect(JSON.stringify(r.content)).toContain("ok.txt");
  });

  test("path가 ../ escape면 throw", async () => {
    const tool = createGrepTool(project);
    await expect(
      tool.execute("c", { pattern: "TOP_SECRET", path: "../outside" }),
    ).rejects.toThrow(/path outside project/);
  });

  test("path가 절대경로면 throw", async () => {
    const tool = createGrepTool(project);
    await expect(
      tool.execute("c", { pattern: "x", path: ABSOLUTE_TARGET }),
    ).rejects.toThrow(/path outside project/);
  });
});

// ---------------------------------------------------------------------------
// tree
// ---------------------------------------------------------------------------

describe("tree 도구", () => {
  test("path 미지정 시 정상 트리", async () => {
    const tool = createTreeTool(project);
    const r = await tool.execute("c", {});
    expect(JSON.stringify(r.content)).toContain("ok.txt");
  });

  test("path가 ../ escape면 throw", async () => {
    const tool = createTreeTool(project);
    await expect(
      tool.execute("c", { path: "../outside" }),
    ).rejects.toThrow(/path outside project/);
  });

  test("path가 절대경로면 throw", async () => {
    const tool = createTreeTool(project);
    await expect(
      tool.execute("c", { path: ABSOLUTE_TARGET }),
    ).rejects.toThrow(/path outside project/);
  });
});

// ---------------------------------------------------------------------------
// script
// ---------------------------------------------------------------------------

describe("script 도구", () => {
  test("../ escape는 throw하고 spawn 안 됨", async () => {
    const tool = createScriptTool(project);
    await expect(
      tool.execute("c", { file: "../outside/anything.ts" }),
    ).rejects.toThrow(/path outside project/);
  });

  test("절대경로는 throw하고 spawn 안 됨", async () => {
    const tool = createScriptTool(project);
    await expect(
      tool.execute("c", { file: ABSOLUTE_TARGET }),
    ).rejects.toThrow(/path outside project/);
  });
});
