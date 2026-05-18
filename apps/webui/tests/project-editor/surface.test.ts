import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

describe("project-editor public surface", () => {
  test("exports the Project editor entrypoints without exposing settle invalidation internals", async () => {
    const surface = await import("@/client/project-editor/index.js");

    expect(surface).toHaveProperty("ProjectEditor");
    expect(surface).toHaveProperty("ProjectEditorProvider");
    expect(surface).toHaveProperty("ProjectFilePicker");
    expect(surface).toHaveProperty("useProjectEditor");
    expect(surface).not.toHaveProperty("useInvalidateOnAgentSettle");
    expect(surface).not.toHaveProperty("fetchProjectTree");
    expect(surface).not.toHaveProperty("readProjectFile");
    expect(surface).not.toHaveProperty("buildTree");
    expect(surface).not.toHaveProperty("FileIcon");
  });

  test("owns the migrated editor files without legacy feature/entity folders", () => {
    expect(existsSync(new URL("../../src/client/project-editor/", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/client/features/editor/", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../src/client/entities/editor/", import.meta.url))).toBe(false);
  });
});
