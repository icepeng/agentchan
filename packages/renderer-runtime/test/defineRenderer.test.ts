import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { defineRenderer } from "../src/defineRenderer.js";
import type { RenderContext } from "../src/types.js";

let host: HTMLElement;

beforeEach(() => {
  GlobalRegistrator.register();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    files: [],
    baseUrl: "/api/projects/test",
    state: {
      messages: [],
      isStreaming: false,
      pendingToolCalls: new Set(),
    },
    actions: {
      send: () => {},
      fill: () => {},
    },
    ...overrides,
  };
}

describe("defineRenderer", () => {
  test("mount writes initial HTML and returns instance with update/destroy", () => {
    const renderer = defineRenderer((ctx) => `<p>files=${ctx.files.length}</p>`);
    const instance = renderer.mount(host, makeCtx());
    expect(host.innerHTML).toBe("<p>files=0</p>");
    expect(typeof instance.update).toBe("function");
    expect(typeof instance.destroy).toBe("function");
  });

  test("update re-renders with new context", () => {
    const renderer = defineRenderer((ctx) => `<p>n=${ctx.files.length}</p>`);
    const instance = renderer.mount(host, makeCtx());
    instance.update(
      makeCtx({
        files: [
          {
            type: "text",
            path: "a.md",
            content: "",
            frontmatter: null,
            modifiedAt: 0,
          },
        ],
      }),
    );
    expect(host.innerHTML).toBe("<p>n=1</p>");
  });

  test("destroy clears DOM and unbinds the click listener", () => {
    const send = mock();
    const renderer = defineRenderer(
      () => `<button data-action="send" data-text="x">go</button>`,
    );
    const instance = renderer.mount(
      host,
      makeCtx({ actions: { send, fill: () => {} } }),
    );
    const btn = host.querySelector("button") as HTMLElement;
    btn.click();
    expect(send).toHaveBeenCalledTimes(1);

    instance.destroy();
    expect(host.innerHTML).toBe("");

    host.innerHTML = `<button data-action="send" data-text="y">go</button>`;
    const btn2 = host.querySelector("button") as HTMLElement;
    btn2.click();
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("theme is exposed on the result when provided", () => {
    const renderer = defineRenderer(() => "<p>x</p>", {
      theme: () => ({ base: { accent: "#f00" } }),
    });
    expect(typeof renderer.theme).toBe("function");
    expect(renderer.theme!(makeCtx())).toEqual({ base: { accent: "#f00" } });
  });

  test("theme key is omitted when not provided", () => {
    const renderer = defineRenderer(() => "<p>x</p>");
    expect("theme" in renderer).toBe(false);
  });
});
