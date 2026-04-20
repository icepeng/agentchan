import { bindActions } from "./bindActions.js";
import { executeInlineScripts } from "./executeInlineScripts.js";
import { morph } from "./morph.js";
import type {
  MountFn,
  RenderContext,
  RendererInstance,
  RendererTheme,
} from "./types.js";

export interface DefineRendererOptions<TCtx> {
  theme?: (ctx: TCtx) => RendererTheme;
}

export interface DefineRendererResult<TCtx> {
  mount: MountFn;
  theme?: (ctx: TCtx) => RendererTheme;
}

/**
 * Wraps a `render(ctx) → string` function as a mount-contract module. The
 * runtime owns event delegation (data-action) and DOM diffing (morph); the
 * renderer remains a function of its context.
 *
 * Side effects that depend on a state edge (scroll-to-bottom on stream end,
 * focus management, autoplay) live inside `render` itself — capture
 * the previous ctx in a module-level closure and dispatch via setTimeout
 * or requestAnimationFrame so the work runs after morph paints. No
 * lifecycle hook needed; the iframe document is fully accessible from
 * inside `render`.
 *
 * `TCtx` is generic so authored renderer.ts files can declare RenderContext
 * inline (with their own narrower file/state union) — the host casts at the
 * boundary and the renderer never observes the difference.
 */
export function defineRenderer<TCtx = RenderContext>(
  render: (ctx: TCtx) => string,
  options: DefineRendererOptions<TCtx> = {},
): DefineRendererResult<TCtx> {
  const { theme } = options;
  const mount: MountFn = (target, initialCtx) => {
    target.innerHTML = render(initialCtx as unknown as TCtx);
    executeInlineScripts(target);
    const cleanupActions = bindActions(target, initialCtx.actions);

    const instance: RendererInstance = {
      update(ctx) {
        const html = render(ctx as unknown as TCtx);
        morph(target, html);
        if (html.indexOf("<script") !== -1) executeInlineScripts(target);
      },
      destroy() {
        cleanupActions();
        target.innerHTML = "";
      },
    };
    return instance;
  };

  return theme ? { mount, theme } : { mount };
}
