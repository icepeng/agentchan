import { describe, expect, test } from "bun:test";
import { isHonoDevPath } from "../../src/server/dev-routing.js";

describe("dev routing", () => {
  test("routes renderer shell with cache query through Hono", () => {
    expect(isHonoDevPath("/renderer-shell.html?slug=asdf-4&v=54553d19ed71d01f"))
      .toBe(true);
  });

  test("routes shared font assets through Hono even with query", () => {
    expect(isHonoDevPath("/fonts/index.css?v=54553d19ed71d01f")).toBe(true);
  });

  test("leaves Vite client modules on Vite middleware", () => {
    expect(isHonoDevPath("/@vite/client")).toBe(false);
    expect(isHonoDevPath("/src/client/main.tsx")).toBe(false);
    expect(isHonoDevPath("/@react-refresh")).toBe(false);
  });
});
