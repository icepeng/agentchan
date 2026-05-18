import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

describe("app-settings public surface", () => {
  test("exports the settings page container", async () => {
    const index = await readFile(
      new URL("../../src/client/app-settings/index.ts", import.meta.url),
      "utf8",
    );
    expect(index).toContain("SettingsView");
    expect(index).not.toContain("NotificationsSection");
  });

  test("owns settings files without the legacy feature folder", () => {
    expect(existsSync(new URL("../../src/client/app-settings/", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/client/features/settings/", import.meta.url))).toBe(false);
  });
});
