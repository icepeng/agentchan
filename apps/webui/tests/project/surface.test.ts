import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

describe("project public surface", () => {
  test("exports Project lifecycle entrypoints through a narrow index", async () => {
    const surface = await import("@/client/project/index.js");

    expect(surface).toHaveProperty("ProjectTabs");
    expect(surface).toHaveProperty("ProjectReadmeModal");
    expect(surface).toHaveProperty("ProjectSurfaceErrorFallback");
    expect(surface).toHaveProperty("useProject");
    expect(surface).toHaveProperty("useProjects");
    expect(surface).toHaveProperty("useCreateProjectFromTemplate");
    expect(surface).not.toHaveProperty("ProjectSettingsModal");
    expect(surface).not.toHaveProperty("SaveAsTemplateModal");
    expect(surface).not.toHaveProperty("useProjectMutations");
    expect(surface).not.toHaveProperty("fetchProjectReadme");
  });

  test("owns Project lifecycle files without legacy feature/entity folders", () => {
    expect(existsSync(new URL("../../src/client/project/", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/client/features/project/", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../src/client/entities/project/", import.meta.url))).toBe(false);
  });
});
