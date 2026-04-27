import { describe, expect, test } from "bun:test";
import { sameBundle } from "../sameBundle.js";

describe("sameBundle", () => {
  test("identical bundle is equal", () => {
    const a = { js: "code", css: ["a", "b"] };
    expect(sameBundle(a, a)).toBe(true);
  });

  test("structurally equal bundles are equal", () => {
    const a = { js: "code", css: ["a", "b"] };
    const b = { js: "code", css: ["a", "b"] };
    expect(sameBundle(a, b)).toBe(true);
  });

  test("different js -> not equal", () => {
    const a = { js: "code-1", css: ["a"] };
    const b = { js: "code-2", css: ["a"] };
    expect(sameBundle(a, b)).toBe(false);
  });

  test("different css length -> not equal", () => {
    const a = { js: "code", css: ["a"] };
    const b = { js: "code", css: ["a", "b"] };
    expect(sameBundle(a, b)).toBe(false);
  });

  test("different css content at same length -> not equal", () => {
    const a = { js: "code", css: ["a", "b"] };
    const b = { js: "code", css: ["a", "c"] };
    expect(sameBundle(a, b)).toBe(false);
  });

  test("different css order -> not equal", () => {
    const a = { js: "code", css: ["a", "b"] };
    const b = { js: "code", css: ["b", "a"] };
    expect(sameBundle(a, b)).toBe(false);
  });

  test("empty css arrays equal", () => {
    expect(sameBundle({ js: "x", css: [] }, { js: "x", css: [] })).toBe(true);
  });
});
