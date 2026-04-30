import { describe, expect, test } from "bun:test";
import { validateTheme } from "../validate.js";

describe("validateTheme", () => {
  test("undefined or null -> null", () => {
    expect(validateTheme(undefined)).toBeNull();
    expect(validateTheme(null)).toBeNull();
  });

  test("non-object input -> null", () => {
    expect(validateTheme("string")).toBeNull();
    expect(validateTheme(42)).toBeNull();
    expect(validateTheme([1, 2, 3])).toBeNull();
  });

  test("missing or non-object base -> null", () => {
    expect(validateTheme({})).toBeNull();
    expect(validateTheme({ base: "not-an-object" })).toBeNull();
    expect(validateTheme({ base: null })).toBeNull();
  });

  test("base with only unknown tokens -> null", () => {
    expect(validateTheme({ base: { unknown: "#fff" } })).toBeNull();
  });

  test("valid base produces theme with picked tokens only", () => {
    const result = validateTheme({
      base: { void: "#000", base: "#fff", unknown: "ignored" },
    });
    expect(result).not.toBeNull();
    expect(result?.base).toEqual({ void: "#000", base: "#fff" });
  });

  test("invalid dark shape ignored, base preserved", () => {
    const result = validateTheme({ base: { void: "#000" }, dark: "not-object" });
    expect(result?.base).toEqual({ void: "#000" });
    expect(result?.dark).toBeUndefined();
  });

  test("dark with no recognized tokens omitted", () => {
    const result = validateTheme({
      base: { void: "#000" },
      dark: { unknown: "ignored" },
    });
    expect(result?.dark).toBeUndefined();
  });

  test("valid dark merges only known tokens", () => {
    const result = validateTheme({
      base: { void: "#000" },
      dark: { void: "#111", unknown: "ignored" },
    });
    expect(result?.dark).toEqual({ void: "#111" });
  });

  test("prefersScheme accepts 'light' or 'dark', rejects others", () => {
    expect(validateTheme({ base: { void: "#000" }, prefersScheme: "light" })?.prefersScheme).toBe(
      "light",
    );
    expect(validateTheme({ base: { void: "#000" }, prefersScheme: "dark" })?.prefersScheme).toBe(
      "dark",
    );
    expect(validateTheme({ base: { void: "#000" }, prefersScheme: "auto" })?.prefersScheme).toBeUndefined();
  });

  test("non-string token values are filtered out", () => {
    const result = validateTheme({
      base: { void: "#000", base: 42, accent: null },
    });
    expect(result?.base).toEqual({ void: "#000" });
  });
});
