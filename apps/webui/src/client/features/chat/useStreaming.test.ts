import { expect, test } from "bun:test";
import type { SessionEntry } from "@/client/entities/session/index.js";
import { branchWithAppendedEntry } from "./streamingBranch.js";

function entry(id: string, parentId: string | null): SessionEntry {
  return {
    type: "custom",
    id,
    parentId,
    timestamp: "2026-01-01T00:00:00.000Z",
    customType: "test",
  };
}

test("branchWithAppendedEntry keeps existing branch when entry is already visible", () => {
  const root = entry("root", null);
  const child = entry("child", "root");

  expect(branchWithAppendedEntry([root, child], [root, child], child)).toEqual([
    root,
    child,
  ]);
});

test("branchWithAppendedEntry appends direct children to the current branch tail", () => {
  const root = entry("root", null);
  const child = entry("child", "root");

  expect(branchWithAppendedEntry([root], [root], child)).toEqual([root, child]);
});

test("branchWithAppendedEntry rebuilds a fork branch from the entry map", () => {
  const root = entry("root", null);
  const oldTail = entry("old-tail", "root");
  const forkParent = entry("fork-parent", "root");
  const forkChild = entry("fork-child", "fork-parent");

  expect(
    branchWithAppendedEntry(
      [root, oldTail, forkParent],
      [root, oldTail],
      forkChild,
    ),
  ).toEqual([root, forkParent, forkChild]);
});
