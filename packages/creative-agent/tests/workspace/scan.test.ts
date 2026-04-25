import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanWorkspaceFiles } from "../../src/workspace/scan.js";
import type { ProjectFile } from "../../src/workspace/types.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "workspace-scan-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function findFile(files: ProjectFile[], path: string): ProjectFile {
  const file = files.find((item) => item.path === path);
  expect(file).toBeDefined();
  return file!;
}

function expectOpaqueDigest(file: ProjectFile): void {
  expect(typeof file.digest).toBe("string");
  expect(file.digest.length).toBeGreaterThan(0);
}

describe("scanWorkspaceFiles", () => {
  test("모든 파일 변형에 불투명 digest를 포함한다", async () => {
    await writeFile(join(tempDir, "note.md"), "# Note", "utf-8");
    await writeFile(join(tempDir, "state.json"), '{"scene":"intro"}', "utf-8");
    await writeFile(join(tempDir, "portrait.png"), new Uint8Array([0, 1, 2]));

    const files = await scanWorkspaceFiles(tempDir);

    expect(findFile(files, "note.md").type).toBe("text");
    expect(findFile(files, "state.json").type).toBe("data");
    expect(findFile(files, "portrait.png").type).toBe("binary");

    for (const file of files) {
      expectOpaqueDigest(file);
    }
  });

  test("텍스트 파일 digest는 내용이 바뀌면 변경된다", async () => {
    const path = join(tempDir, "note.md");
    await writeFile(path, "# One", "utf-8");
    const before = findFile(await scanWorkspaceFiles(tempDir), "note.md").digest;

    await writeFile(path, "# Two", "utf-8");
    const after = findFile(await scanWorkspaceFiles(tempDir), "note.md").digest;

    expect(after).not.toBe(before);
  });

  test("데이터 파일 digest는 내용이 바뀌면 변경된다", async () => {
    const path = join(tempDir, "state.yaml");
    await writeFile(path, "scene: intro\n", "utf-8");
    const before = findFile(await scanWorkspaceFiles(tempDir), "state.yaml").digest;

    await writeFile(path, "scene: finale\n", "utf-8");
    const after = findFile(await scanWorkspaceFiles(tempDir), "state.yaml").digest;

    expect(after).not.toBe(before);
  });

  test("바이너리 파일 digest는 크기가 바뀌면 변경된다", async () => {
    const path = join(tempDir, "portrait.png");
    await writeFile(path, new Uint8Array([0, 1, 2]));
    const before = findFile(await scanWorkspaceFiles(tempDir), "portrait.png").digest;

    await writeFile(path, new Uint8Array([0, 1, 2, 3]));
    const after = findFile(await scanWorkspaceFiles(tempDir), "portrait.png").digest;

    expect(after).not.toBe(before);
  });

  test("바이너리 파일 digest는 수정 시간이 바뀌면 변경된다", async () => {
    const path = join(tempDir, "portrait.png");
    await writeFile(path, new Uint8Array([0, 1, 2]));
    const before = findFile(await scanWorkspaceFiles(tempDir), "portrait.png").digest;

    const nextModifiedAt = new Date(Date.now() + 10_000);
    await utimes(path, nextModifiedAt, nextModifiedAt);
    const after = findFile(await scanWorkspaceFiles(tempDir), "portrait.png").digest;

    expect(after).not.toBe(before);
  });
});
