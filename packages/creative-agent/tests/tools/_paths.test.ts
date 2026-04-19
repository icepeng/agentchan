import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { resolveInProject } from "../../src/tools/_paths.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "paths-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("정상 경로", () => {
  test("프로젝트 루트의 빈 문자열은 root 자신을 반환", () => {
    expect(resolveInProject(root, "")).toBe(root);
  });

  test("'.'은 root 자신을 반환", () => {
    expect(resolveInProject(root, ".")).toBe(root);
  });

  test("단순 파일명은 root 하위 절대경로", () => {
    expect(resolveInProject(root, "file.txt")).toBe(join(root, "file.txt"));
  });

  test("중첩 경로는 그대로 join", () => {
    expect(resolveInProject(root, "sub/dir/file.txt")).toBe(
      join(root, "sub", "dir", "file.txt"),
    );
  });

  test("내부에서 끝나는 정상화 가능 경로는 통과", () => {
    expect(resolveInProject(root, "sub/../file.txt")).toBe(join(root, "file.txt"));
  });
});

describe("escape 차단", () => {
  test("'..' 단독은 throw", () => {
    expect(() => resolveInProject(root, "..")).toThrow(/path outside project/);
  });

  test("'../foo'는 throw", () => {
    expect(() => resolveInProject(root, "../foo")).toThrow(/path outside project/);
  });

  test("'../../escape'는 throw", () => {
    expect(() => resolveInProject(root, "../../escape")).toThrow(
      /path outside project/,
    );
  });

  test("내부에서 .. 로 빠져나가는 경로는 throw", () => {
    expect(() => resolveInProject(root, "sub/../../escape")).toThrow(
      /path outside project/,
    );
  });
});

describe("절대 경로 차단", () => {
  test("POSIX 스타일 절대경로는 throw", () => {
    expect(() => resolveInProject(root, "/etc/passwd")).toThrow(
      /path outside project/,
    );
  });

  if (process.platform === "win32") {
    test("Windows 절대경로는 throw", () => {
      expect(() => resolveInProject(root, "C:\\Windows\\System32\\drivers\\etc\\hosts")).toThrow(
        /path outside project/,
      );
    });

    test("다른 드라이브 절대경로는 throw", () => {
      // root는 보통 C: 또는 사용자 tmpdir 드라이브. 다른 드라이브로 명시.
      const other = root.startsWith("D:") ? "Z:\\foo" : "D:\\foo";
      expect(() => resolveInProject(root, other)).toThrow(/path outside project/);
    });
  }
});

describe("error 메시지", () => {
  test("원본 userPath를 메시지에 포함", () => {
    try {
      resolveInProject(root, "../leak");
      throw new Error("expected throw");
    } catch (err) {
      expect((err as Error).message).toContain("../leak");
    }
  });
});

describe("플랫폼 sep 일관성", () => {
  test("결과는 항상 platform-native sep을 사용 (resolve 동작 확인용)", () => {
    const got = resolveInProject(root, "a/b/c.txt");
    expect(got).toContain(sep);
  });
});
