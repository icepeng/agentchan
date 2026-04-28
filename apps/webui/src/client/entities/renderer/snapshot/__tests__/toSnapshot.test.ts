import { describe, expect, test } from "bun:test";
import type { ProjectFile, TextFile } from "@agentchan/creative-agent";
import { buildRendererSnapshot, reuseStableFiles } from "../toSnapshot.js";
import type { RendererAgentState } from "../../renderer.types.js";

function textFile(
  path: string,
  digest: string,
  modifiedAt: number,
  content = "x",
): TextFile {
  return {
    type: "text",
    path,
    content,
    frontmatter: null,
    modifiedAt,
    digest,
  };
}

const EMPTY_STATE: RendererAgentState = {
  messages: [],
  isStreaming: false,
  pendingToolCalls: [],
};

describe("reuseStableFiles", () => {
  test("returns next when previous is undefined", () => {
    const next: ProjectFile[] = [textFile("a.md", "d1", 1)];
    expect(reuseStableFiles(undefined, next)).toBe(next);
  });

  test("returns previous reference when all files match by digest+modifiedAt", () => {
    const previous: readonly ProjectFile[] = [
      textFile("a.md", "d1", 1),
      textFile("b.md", "d2", 2),
    ];
    const next: ProjectFile[] = [
      textFile("a.md", "d1", 1),
      textFile("b.md", "d2", 2),
    ];
    expect(reuseStableFiles(previous, next)).toBe(previous);
  });

  test("preserves old file references for unchanged files when one changes", () => {
    const oldA = textFile("a.md", "d1", 1);
    const oldB = textFile("b.md", "d2", 2);
    const newB = textFile("b.md", "d2-new", 3);
    const previous = [oldA, oldB];
    const result = reuseStableFiles(previous, [oldA, newB]);
    expect(result).not.toBe(previous);
    expect(result[0]).toBe(oldA);
    expect(result[1]).toBe(newB);
  });

  test("digest change forces new reference", () => {
    const oldA = textFile("a.md", "d1", 1);
    const newA = textFile("a.md", "d2", 1);
    const result = reuseStableFiles([oldA], [newA]);
    expect(result[0]).toBe(newA);
  });

  test("modifiedAt change forces new reference", () => {
    const oldA = textFile("a.md", "d1", 1);
    const newA = textFile("a.md", "d1", 2);
    const result = reuseStableFiles([oldA], [newA]);
    expect(result[0]).toBe(newA);
  });

  test("file added -> new array, existing reference preserved", () => {
    const oldA = textFile("a.md", "d1", 1);
    const newB = textFile("b.md", "d2", 2);
    const previous = [oldA];
    const result = reuseStableFiles(previous, [oldA, newB]);
    expect(result).not.toBe(previous);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(oldA);
    expect(result[1]).toBe(newB);
  });

  test("file removed -> new array", () => {
    const oldA = textFile("a.md", "d1", 1);
    const oldB = textFile("b.md", "d2", 2);
    const result = reuseStableFiles([oldA, oldB], [oldA]);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(oldA);
  });

  test("file renamed (same digest, different path) -> new reference", () => {
    const oldA = textFile("a.md", "d1", 1);
    const renamed = textFile("a-renamed.md", "d1", 1);
    const result = reuseStableFiles([oldA], [renamed]);
    expect(result[0]).toBe(renamed);
  });
});

describe("buildRendererSnapshot", () => {
  test("composes baseUrl from slug", () => {
    const snapshot = buildRendererSnapshot("my-slug", EMPTY_STATE, [], undefined);
    expect(snapshot.baseUrl).toBe("/api/projects/my-slug");
  });

  test("URL-encodes slug in baseUrl", () => {
    const snapshot = buildRendererSnapshot("a/b c", EMPTY_STATE, [], undefined);
    expect(snapshot.baseUrl).toBe("/api/projects/a%2Fb%20c");
  });

  test("reuses previous files reference when nothing changed", () => {
    const previous: readonly ProjectFile[] = [textFile("a.md", "d1", 1)];
    const next: ProjectFile[] = [textFile("a.md", "d1", 1)];
    const snapshot = buildRendererSnapshot("s", EMPTY_STATE, next, previous);
    expect(snapshot.files).toBe(previous);
  });
});
