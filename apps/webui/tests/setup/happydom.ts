import { Window } from "happy-dom";

const window = new Window();

globalThis.window = window as unknown as Window & typeof globalThis;
globalThis.document = window.document as unknown as Document;
globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
globalThis.navigator = window.navigator as unknown as Navigator;
