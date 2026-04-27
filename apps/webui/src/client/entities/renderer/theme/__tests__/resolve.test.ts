import { describe, expect, test } from "bun:test";
import { resolveThemeVars } from "../resolve.js";
import type { RendererTheme } from "../../renderer.types.js";

describe("resolveThemeVars", () => {
  const baseOnly: RendererTheme = {
    base: { void: "#000", base: "#fff", accent: "#0f0" },
  };
  const baseAndDark: RendererTheme = {
    base: { void: "#000", base: "#fff" },
    dark: { void: "#111", base: "#222" },
  };

  test("light userScheme + base only -> uses base, single mode (light)", () => {
    const r = resolveThemeVars(baseOnly, "light");
    expect(r.effectiveScheme).toBe("light");
    expect(r.forceScheme).toBe(false);
    expect(r.vars["--color-void"]).toBe("#000");
    expect(r.vars["--color-base"]).toBe("#fff");
    expect(r.vars["--color-accent"]).toBe("#0f0");
  });

  test("dark userScheme + base only -> still uses base, single mode (light)", () => {
    const r = resolveThemeVars(baseOnly, "dark");
    expect(r.effectiveScheme).toBe("light");
    expect(r.forceScheme).toBe(false);
    expect(r.vars["--color-void"]).toBe("#000");
  });

  test("light userScheme + base+dark -> uses base", () => {
    const r = resolveThemeVars(baseAndDark, "light");
    expect(r.effectiveScheme).toBe("light");
    expect(r.forceScheme).toBe(false);
    expect(r.vars["--color-void"]).toBe("#000");
    expect(r.vars["--color-base"]).toBe("#fff");
  });

  test("dark userScheme + base+dark -> merges dark over base", () => {
    const r = resolveThemeVars(baseAndDark, "dark");
    expect(r.effectiveScheme).toBe("dark");
    expect(r.forceScheme).toBe(false);
    expect(r.vars["--color-void"]).toBe("#111");
    expect(r.vars["--color-base"]).toBe("#222");
  });

  test("prefersScheme: 'dark' forces dark regardless of userScheme", () => {
    const theme: RendererTheme = { ...baseAndDark, prefersScheme: "dark" };
    const r = resolveThemeVars(theme, "light");
    expect(r.effectiveScheme).toBe("dark");
    expect(r.forceScheme).toBe(true);
    expect(r.vars["--color-void"]).toBe("#111");
  });

  test("prefersScheme: 'light' forces light regardless of userScheme", () => {
    const theme: RendererTheme = { ...baseAndDark, prefersScheme: "light" };
    const r = resolveThemeVars(theme, "dark");
    expect(r.effectiveScheme).toBe("light");
    expect(r.forceScheme).toBe(true);
    expect(r.vars["--color-void"]).toBe("#000");
  });

  test("only known tokens are emitted as CSS vars", () => {
    const r = resolveThemeVars(baseOnly, "light");
    const keys = Object.keys(r.vars).sort();
    expect(keys).toEqual(["--color-accent", "--color-base", "--color-void"]);
  });
});
