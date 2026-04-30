import type { RendererBundle } from "../renderer.types.js";

export function sameBundle(a: RendererBundle, b: RendererBundle): boolean {
  if (a.js !== b.js || a.css.length !== b.css.length) return false;
  return a.css.every((css, index) => css === b.css[index]);
}
