import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

describe("library public surface", () => {
  test("exports the Library entrypoints through a narrow index", async () => {
    const surface = await import("@/client/library/index.js");

    expect(surface).toHaveProperty("LibraryPage");
    expect(surface).toHaveProperty("useTemplates");
    expect(surface).toHaveProperty("setTemplateTrust");
    expect(surface).toHaveProperty("saveProjectAsTemplate");
    expect(surface).toHaveProperty("saveTemplateOrder");
    expect(surface).toHaveProperty("TrustTemplateDialog");
    expect(surface).not.toHaveProperty("useTemplateMutations");
    expect(surface).not.toHaveProperty("useTemplateReadme");
  });

  test("owns the migrated Template files without legacy entity/page/readme locations", () => {
    expect(existsSync(new URL("../../src/client/library/", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/client/entities/template/", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../src/client/pages/TemplatesPage.tsx", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../src/client/shared/ReadmeView.tsx", import.meta.url))).toBe(false);
  });
});
