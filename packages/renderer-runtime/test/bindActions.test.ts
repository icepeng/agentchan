import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { bindActions } from "../src/bindActions.js";

let host: HTMLElement;

beforeEach(() => {
  GlobalRegistrator.register();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

describe("bindActions", () => {
  test("dispatches send when data-action='send' clicked", () => {
    const send = mock();
    const fill = mock();
    const cleanup = bindActions(host, { send, fill });
    host.innerHTML = `<button data-action="send" data-text="hi">label</button>`;
    (host.querySelector("button") as HTMLElement).click();
    expect(send).toHaveBeenCalledWith("hi");
    expect(fill).not.toHaveBeenCalled();
    cleanup();
  });

  test("dispatches fill when data-action='fill' clicked", () => {
    const send = mock();
    const fill = mock();
    const cleanup = bindActions(host, { send, fill });
    host.innerHTML = `<button data-action="fill" data-text="x">label</button>`;
    (host.querySelector("button") as HTMLElement).click();
    expect(fill).toHaveBeenCalledWith("x");
    expect(send).not.toHaveBeenCalled();
    cleanup();
  });

  test("falls back to textContent when data-text missing", () => {
    const send = mock();
    const cleanup = bindActions(host, { send, fill: () => {} });
    host.innerHTML = `<button data-action="send">  hello  </button>`;
    (host.querySelector("button") as HTMLElement).click();
    expect(send).toHaveBeenCalledWith("hello");
    cleanup();
  });

  test("ignores empty text", () => {
    const send = mock();
    const cleanup = bindActions(host, { send, fill: () => {} });
    host.innerHTML = `<button data-action="send" data-text=""></button>`;
    (host.querySelector("button") as HTMLElement).click();
    expect(send).not.toHaveBeenCalled();
    cleanup();
  });

  test("walks up to the closest [data-action] ancestor", () => {
    const send = mock();
    const cleanup = bindActions(host, { send, fill: () => {} });
    host.innerHTML = `<button data-action="send" data-text="parent"><span>inner</span></button>`;
    const span = host.querySelector("span") as HTMLElement;
    span.click();
    expect(send).toHaveBeenCalledWith("parent");
    cleanup();
  });

  test("ignores unknown data-action values", () => {
    const send = mock();
    const fill = mock();
    const cleanup = bindActions(host, { send, fill });
    host.innerHTML = `<button data-action="bogus" data-text="x">x</button>`;
    (host.querySelector("button") as HTMLElement).click();
    expect(send).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    cleanup();
  });

  test("cleanup removes the listener", () => {
    const send = mock();
    const cleanup = bindActions(host, { send, fill: () => {} });
    cleanup();
    host.innerHTML = `<button data-action="send" data-text="x">x</button>`;
    (host.querySelector("button") as HTMLElement).click();
    expect(send).not.toHaveBeenCalled();
  });
});
