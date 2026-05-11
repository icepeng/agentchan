import { describe, expect, test } from "bun:test";
import {
  resolveThemeVars,
  validateTheme,
} from "../../src/client/entities/renderer/index.js";

const COMPLETE_LIGHT = {
  void: "#ffffff",
  base: "#f5f5f5",
  surface: "#eeeeee",
  elevated: "#dddddd",
  accent: "#44aaaa",
  fg: "#111111",
  fg2: "#333333",
  fg3: "#666666",
  fg4: "#888888",
  edge: "#000000",
};

const COMPLETE_DARK = {
  void: "#000000",
  base: "#111111",
  surface: "#222222",
  elevated: "#333333",
  accent: "#66cccc",
  fg: "#eeeeee",
  fg2: "#cccccc",
  fg3: "#999999",
  fg4: "#777777",
  edge: "#ffffff",
};

describe("validateTheme", () => {
  test("rejects empty object", () => {
    expect(validateTheme({})).toBeNull();
  });

  test("rejects incomplete light palette", () => {
    expect(validateTheme({ light: { ...COMPLETE_LIGHT, fg4: undefined } })).toBeNull();
    expect(validateTheme({ light: { accent: "#44aaaa" } })).toBeNull();
  });

  test("rejects incomplete dark palette", () => {
    expect(validateTheme({ dark: { ...COMPLETE_DARK, fg4: undefined } })).toBeNull();
  });
});

describe("resolveThemeVars", () => {
  test("light + dark follows user scheme, no force", () => {
    const both = { light: COMPLETE_LIGHT, dark: COMPLETE_DARK };
    const dark = resolveThemeVars(both, "dark");
    expect(dark.effectiveScheme).toBe("dark");
    expect(dark.forceScheme).toBe(false);
    expect(dark.vars["--color-base"]).toBe(COMPLETE_DARK.base);

    const light = resolveThemeVars(both, "light");
    expect(light.effectiveScheme).toBe("light");
    expect(light.forceScheme).toBe(false);
    expect(light.vars["--color-base"]).toBe(COMPLETE_LIGHT.base);
  });

  test("light only forces light regardless of user scheme", () => {
    const light = { light: COMPLETE_LIGHT };
    const fromDark = resolveThemeVars(light, "dark");
    expect(fromDark.effectiveScheme).toBe("light");
    expect(fromDark.forceScheme).toBe(true);
    expect(fromDark.vars["--color-base"]).toBe(COMPLETE_LIGHT.base);

    const fromLight = resolveThemeVars(light, "light");
    expect(fromLight.effectiveScheme).toBe("light");
    expect(fromLight.forceScheme).toBe(true);
  });

  test("dark only forces dark regardless of user scheme", () => {
    const dark = { dark: COMPLETE_DARK };
    const fromLight = resolveThemeVars(dark, "light");
    expect(fromLight.effectiveScheme).toBe("dark");
    expect(fromLight.forceScheme).toBe(true);
    expect(fromLight.vars["--color-base"]).toBe(COMPLETE_DARK.base);

    const fromDark = resolveThemeVars(dark, "dark");
    expect(fromDark.effectiveScheme).toBe("dark");
    expect(fromDark.forceScheme).toBe(true);
  });
});
