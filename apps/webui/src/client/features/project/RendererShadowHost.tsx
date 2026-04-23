import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Hosts the renderer subtree inside a Shadow DOM so template-authored CSS
 * can't leak into the host shell. Document-level design tokens
 * (`--color-*`, `@font-face`) inherit across the shadow boundary, so
 * renderers can rely on host colors/fonts without re-declaring them.
 *
 * The shadow root is attached inside the ref callback and published via
 * state in the same commit — the portal renders on the first paint rather
 * than waiting for an effect-triggered rerender, which avoids a blank
 * frame on project switch.
 */
export function RendererShadowHost({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<ShadowRoot | null>(null);

  const attachHost = (el: HTMLDivElement | null) => {
    if (!el) return;
    setRoot(el.shadowRoot ?? el.attachShadow({ mode: "open" }));
  };

  return (
    <div ref={attachHost} className="flex-1 min-h-0 flex flex-col">
      {root && createPortal(children, root)}
    </div>
  );
}
