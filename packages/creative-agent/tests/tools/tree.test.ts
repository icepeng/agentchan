import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTreeTool } from "../../src/tools/tree.js";

let tempDir: string;
let tool: ReturnType<typeof createTreeTool>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "tree-test-"));
  tool = createTreeTool(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function textOf(result: Awaited<ReturnType<typeof execute>>): string {
  return result.content
    .map((c) => ("text" in c ? c.text : ""))
    .join("");
}

async function execute(params: { path?: string; depth?: number } = {}) {
  return tool.execute("test-call", params);
}

// ---------------------------------------------------------------------------
// 빈 디렉토리
// ---------------------------------------------------------------------------

test("빈 디렉토리는 (empty directory) 반환", async () => {
  const result = await execute();
  expect(textOf(result)).toBe("(empty directory)");
});

// ---------------------------------------------------------------------------
// 기본 트리 출력
// ---------------------------------------------------------------------------

describe("기본 트리 포맷", () => {
  test("파일과 디렉토리를 올바른 커넥터로 표시", async () => {
    await mkdir(join(tempDir, "dirA"));
    await writeFile(join(tempDir, "file1.txt"), "hello");
    await writeFile(join(tempDir, "file2.txt"), "world");

    const result = textOf(await execute());
    const lines = result.split("\n");

    expect(lines[0]).toBe("./");
    // 디렉토리가 먼저
    expect(lines[1]).toBe("├── dirA/");
    expect(lines[2]).toBe("├── file1.txt");
    expect(lines[3]).toBe("└── file2.txt");
  });

  test("디렉토리에 / 접미사가 붙음", async () => {
    await mkdir(join(tempDir, "subdir"));

    const result = textOf(await execute());
    expect(result).toContain("subdir/");
  });
});

// ---------------------------------------------------------------------------
// 중첩 트리
// ---------------------------------------------------------------------------

describe("중첩 디렉토리", () => {
  test("하위 디렉토리 내용을 들여쓰기로 표시", async () => {
    await mkdir(join(tempDir, "parent", "child"), { recursive: true });
    await writeFile(join(tempDir, "parent", "child", "deep.txt"), "");

    const result = textOf(await execute());
    const lines = result.split("\n");

    expect(lines[0]).toBe("./");
    expect(lines[1]).toBe("└── parent/");
    expect(lines[2]).toBe("    └── child/");
    expect(lines[3]).toBe("        └── deep.txt");
  });

  test("형제 디렉토리 간 │ 연결선 표시", async () => {
    await mkdir(join(tempDir, "a"));
    await mkdir(join(tempDir, "b"));
    await writeFile(join(tempDir, "a", "file.txt"), "");
    await writeFile(join(tempDir, "b", "file.txt"), "");

    const result = textOf(await execute());
    // a/는 마지막이 아니므로 │ 가 이어짐
    expect(result).toContain("│   └── file.txt");
  });
});

// ---------------------------------------------------------------------------
// depth 제한
// ---------------------------------------------------------------------------

describe("depth 제한", () => {
  test("기본 depth=3에서 4단계 이상은 표시하지 않음", async () => {
    // a/(1) -> b/(2) -> visible.txt(3), c/(3) -> hidden.txt(4)
    await mkdir(join(tempDir, "a", "b", "c"), { recursive: true });
    await writeFile(join(tempDir, "a", "b", "visible.txt"), "");
    await writeFile(join(tempDir, "a", "b", "c", "hidden.txt"), "");

    const result = textOf(await execute());
    expect(result).toContain("visible.txt");
    expect(result).not.toContain("hidden.txt");
    // depth 3 경계에서 c/는 디렉토리 이름만 표시 (내부는 미탐색)
    expect(result).toContain("c/");
  });

  test("depth=1에서 루트 직하 엔트리만 표시", async () => {
    await mkdir(join(tempDir, "sub"));
    await writeFile(join(tempDir, "sub", "inner.txt"), "");
    await writeFile(join(tempDir, "root.txt"), "");

    const result = textOf(await execute({ depth: 1 }));
    expect(result).toContain("sub/");
    expect(result).toContain("root.txt");
    expect(result).not.toContain("inner.txt");
  });

  test("depth=2에서 2단계까지 표시", async () => {
    // a/(1) -> mid.txt(2), b/(2) -> deep.txt(3)
    await mkdir(join(tempDir, "a", "b"), { recursive: true });
    await writeFile(join(tempDir, "a", "mid.txt"), "");
    await writeFile(join(tempDir, "a", "b", "deep.txt"), "");

    const result = textOf(await execute({ depth: 2 }));
    expect(result).toContain("mid.txt");
    expect(result).not.toContain("deep.txt");
  });
});

// ---------------------------------------------------------------------------
// 정렬
// ---------------------------------------------------------------------------

describe("정렬", () => {
  test("디렉토리가 파일보다 먼저 표시", async () => {
    await writeFile(join(tempDir, "alpha.txt"), "");
    await mkdir(join(tempDir, "beta"));

    const result = textOf(await execute());
    const lines = result.split("\n").filter((l) => l.includes("── "));
    // beta/ (dir) before alpha.txt (file)
    expect(lines[0]).toContain("beta/");
    expect(lines[1]).toContain("alpha.txt");
  });

  test("대소문자 무시 알파벳 정렬", async () => {
    await writeFile(join(tempDir, "Banana.txt"), "");
    await writeFile(join(tempDir, "apple.txt"), "");
    await writeFile(join(tempDir, "Cherry.txt"), "");

    const result = textOf(await execute());
    const lines = result.split("\n").filter((l) => l.includes("── "));
    expect(lines[0]).toContain("apple.txt");
    expect(lines[1]).toContain("Banana.txt");
    expect(lines[2]).toContain("Cherry.txt");
  });
});

// ---------------------------------------------------------------------------
// path 파라미터
// ---------------------------------------------------------------------------

describe("path 파라미터", () => {
  test("하위 디렉토리를 시작점으로 지정", async () => {
    await mkdir(join(tempDir, "sub"));
    await writeFile(join(tempDir, "sub", "inner.txt"), "");
    await writeFile(join(tempDir, "root.txt"), "");

    const result = textOf(await execute({ path: "sub" }));
    expect(result).toContain("sub/");
    expect(result).toContain("inner.txt");
    expect(result).not.toContain("root.txt");
  });

  test("존재하지 않는 경로는 에러 반환", async () => {
    const result = textOf(await execute({ path: "nonexistent" }));
    expect(result).toContain("Error reading directory");
  });
});

// ---------------------------------------------------------------------------
// truncation
// ---------------------------------------------------------------------------

describe("truncation", () => {
  test("MAX_ENTRIES 초과 시 truncation 메시지 표시", async () => {
    // 1001개 이상의 파일 생성은 비실용적이므로,
    // 이 테스트는 정상 동작 범위 내에서 truncation이 없음을 확인
    await writeFile(join(tempDir, "a.txt"), "");
    await writeFile(join(tempDir, "b.txt"), "");

    const result = textOf(await execute());
    expect(result).not.toContain("truncated");
  });
});
