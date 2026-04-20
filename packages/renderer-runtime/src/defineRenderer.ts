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

// The iframe owns the scroll viewport, so chat templates that emit
// `[data-chat-anchor]` need a document-scoped scrollIntoView after paint.
// defineRenderer does it per mount/update on behalf of every template
// instead of asking each renderer to wire its own rAF.
interface AnchorScroller {
  (target: HTMLElement): void;
}

function createAnchorScroller(): AnchorScroller {
  // During streaming, update() fires every rAF. Gate on textContent length
  // so we only pay the querySelector + scrollIntoView when content actually
  // grew — scrollIntoView forces layout, and on a stable frame it's waste.
  let lastLength = -1;
  return (target) => {
    const length = target.textContent?.length ?? 0;
    if (length === lastLength) return;
    lastLength = length;
    const anchor = target.querySelector<HTMLElement>("[data-chat-anchor]");
    if (!anchor) return;
    const win = target.ownerDocument?.defaultView;
    const schedule = win?.requestAnimationFrame?.bind(win) ?? ((cb: () => void) => setTimeout(cb, 0));
    schedule(() => {
      anchor.scrollIntoView({ block: "end", behavior: "auto" });
    });
  };
}

/**
 * Wraps a `render(ctx) → string` function as a mount-contract module. The
 * runtime owns event delegation (data-action), DOM diffing (morph), and
 * auto-scroll to `[data-chat-anchor]` after each paint.
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
    const scrollAnchor = createAnchorScroller();
    scrollAnchor(target);

    const instance: RendererInstance = {
      update(ctx) {
        const html = render(ctx as unknown as TCtx);
        morph(target, html);
        if (html.indexOf("<script") !== -1) executeInlineScripts(target);
        scrollAnchor(target);
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
