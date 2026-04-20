import { join } from "node:path";

// Produces the CSS bundle injected into each renderer iframe. The iframe is
// a same-origin document but still its own stylesheet scope — Tailwind
// preflight, @theme tokens, scrollbar styles, and font imports must be
// inlined here for the rendered HTML to match the host's look.
const MAIN_CSS_PATH = join(import.meta.dir, "../..", "client/main.css");

// Pulled into the iframe via CSS @import so client code doesn't need a
// separate font-links string — keeps the host bootstrap config invariant.
const FONT_IMPORTS_CSS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Lexend:wght@300;400;500&family=Fira+Code:wght@400;500&display=swap');
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
`;

// Sentinel uses `<div hidden>` to gate its pending strip; without
// preflight, its `.ms-pending-strip { display:flex }` wins and the strip
// shows even at rest. Other entries restore preflight pieces renderers
// historically relied on.
const IFRAME_RESET_CSS = `
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;padding:0;}
[hidden]{display:none !important;}
html,body{min-height:100%;background:var(--color-void);color:var(--color-fg);font-family:var(--font-family-body);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
body{min-height:100vh;}
`;

// Tailwind's `@theme` directive expands to `:root` at build time; inside the
// iframe we don't run Tailwind so we do that one rewrite ourselves. The rest
// of main.css (keyframes, scrollbar, ::selection, utilities) is identical
// CSS the browser parses directly.
function adaptMainCssForIframe(css: string): string {
  let out = css.replace(/@import\s+["']tailwindcss["']\s*;?\s*/g, "");
  // Non-greedy `[\s\S]*?` already stops at the first `}`, and `@theme`
  // blocks never nest braces — so we don't need `\n\}` as an anchor.
  // Requiring the newline would silently no-op if main.css were ever
  // collapsed (formatter, inline authoring), leaking a raw `@theme` block
  // that browsers discard per CSS error-recovery, losing every token.
  out = out.replace(/@theme\s*\{([\s\S]*?)\}/g, ":root {$1}");
  return out;
}

export function createRendererRuntimeService() {
  // Cache the Promise (not the resolved value) so concurrent first-requests
  // share one file read instead of racing.
  let baseCssPromise: Promise<string> | null = null;

  async function buildBaseCss(): Promise<string> {
    const mainCss = await Bun.file(MAIN_CSS_PATH).text();
    // @import rules must come before any other rule per CSS spec.
    return `${FONT_IMPORTS_CSS}${adaptMainCssForIframe(mainCss)}\n${IFRAME_RESET_CSS}`;
  }

  return {
    getBaseCss(): Promise<string> {
      if (!baseCssPromise) baseCssPromise = buildBaseCss();
      return baseCssPromise;
    },
  };
}

export type RendererRuntimeService = ReturnType<
  typeof createRendererRuntimeService
>;
