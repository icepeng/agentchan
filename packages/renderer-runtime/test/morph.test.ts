import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { morph } from "../src/morph.js";

let host: HTMLElement;

beforeEach(() => {
  GlobalRegistrator.register();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

describe("morph", () => {
  test("replaces inner content", () => {
    host.innerHTML = "<p>old</p>";
    morph(host, "<p>new</p>");
    expect(host.innerHTML).toContain("new");
    expect(host.innerHTML).not.toContain("old");
  });

  test("preserves the active input value across morphs (ignoreActiveValue)", () => {
    host.innerHTML = `<input type="text" id="x" value="initial" />`;
    const input = host.querySelector("input") as HTMLInputElement;
    input.focus();
    input.value = "user-typed";
    morph(host, `<input type="text" id="x" value="server-state" />`);
    const after = host.querySelector("input") as HTMLInputElement;
    expect(after.value).toBe("user-typed");
  });
});
