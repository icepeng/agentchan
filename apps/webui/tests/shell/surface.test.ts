import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

describe("shell public surface", () => {
  test("exports only AppShell, useView, and view types", async () => {
    const index = await readFile(
      new URL("../../src/client/shell/index.ts", import.meta.url),
      "utf8",
    );
    expect(index).toContain("AppShell");
    expect(index).toContain("useView");
    expect(index).toContain("export type");
    expect(index).not.toContain("useViewState");
    expect(index).not.toContain("useViewDispatch");
    expect(index).not.toContain("selectActiveProjectSlug");
    expect(index).not.toContain("selectActiveSessionId");
  });

  test("owns app shell and view files without legacy FSD folders", () => {
    expect(existsSync(new URL("../../src/client/shell/", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/client/app/", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../src/client/pages/", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../src/client/entities/", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../src/client/features/", import.meta.url))).toBe(false);
  });
});
