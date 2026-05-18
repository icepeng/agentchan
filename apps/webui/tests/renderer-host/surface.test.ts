import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

describe("renderer-host public surface", () => {
  test("exports the Renderer host seam through a narrow index", async () => {
    const surface = await import("../../src/client/renderer-host/index.js");

    expect(surface).toHaveProperty("RenderedView");
    expect(surface).toHaveProperty("useProjectTheme");
    expect(surface).toHaveProperty("resolveThemeVars");
    expect(surface).not.toHaveProperty("RendererViewProvider");
    expect(surface).not.toHaveProperty("RendererActionProvider");
    expect(surface).not.toHaveProperty("useRendererOutput");
    expect(surface).not.toHaveProperty("validateTheme");
  });

  test("owns Renderer host files without legacy renderer entity folder", () => {
    expect(existsSync(new URL("../../src/client/renderer-host/", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/client/entities/renderer/", import.meta.url))).toBe(false);
  });
});
