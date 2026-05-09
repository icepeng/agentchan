import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_SPECIFIERS } from "@agentchan/renderer-vendor";

/**
 * Static iframe shell HTML, host-theme stylesheet, and the iframe-bootstrap
 * module bundle. All cached after the first request — these are project-
 * independent, change only with a server redeploy, and are tiny enough to
 * keep in memory.
 *
 * The shell HTML wires up:
 *   - host-theme.css (Tailwind tokens as `[data-theme]` blocks)
 *   - importmap for the bundled renderer's external React imports
 *   - the iframe-bootstrap module that handles INIT/RPC/HYDRATE/mount
 */

export interface HostShellService {
  shellHtml(): string;
  bootstrapJs(): Promise<{ js: string; digest: string }>;
  hostThemeCss(): { css: string; digest: string };
}

interface BootstrapCache {
  js: string;
  digest: string;
}

interface ThemeCache {
  css: string;
  digest: string;
}

const HOST_THEME_DARK: Record<string, string> = {
  "--color-void": "#050508",
  "--color-base": "#0a0a10",
  "--color-surface": "#111118",
  "--color-elevated": "#1a1a24",
  "--color-raised": "#222230",
  "--color-accent": "#2dd4bf",
  "--color-warm": "#fbbf24",
  "--color-danger": "#ef4444",
  "--color-fg": "#e4e4e7",
  "--color-fg-2": "#a1a1aa",
  "--color-fg-3": "#8a8a94",
  "--color-fg-4": "#6a6a75",
  "--color-edge": "#ffffff",
  "--font-family-display":
    "'Pretendard Variable', 'Syne', system-ui, sans-serif",
  "--font-family-body":
    "'Pretendard Variable', 'Lexend', system-ui, sans-serif",
  "--font-family-mono": "'Fira Code', ui-monospace, monospace",
};

const HOST_THEME_LIGHT: Record<string, string> = {
  "--color-void": "#f4f4f8",
  "--color-base": "#eaeaf0",
  "--color-surface": "#ffffff",
  "--color-elevated": "#f0f0f5",
  "--color-raised": "#e2e2ea",
  "--color-accent": "#0d9488",
  "--color-warm": "#b45309",
  "--color-danger": "#dc2626",
  "--color-fg": "#1a1a2e",
  "--color-fg-2": "#4a4a5e",
  "--color-fg-3": "#6e6e82",
  "--color-fg-4": "#8a8a9e",
  "--color-edge": "#1a1a2e",
};

export interface HostShellOptions {
  /** True when the dev server is the source for vendor fixtures. */
  isDev: boolean;
}

export function createHostShellService(
  options: HostShellOptions,
): HostShellService {
  let bootstrap: BootstrapCache | null = null;
  let theme: ThemeCache | null = null;

  return {
    shellHtml(): string {
      return renderShellHtml(options.isDev);
    },
    async bootstrapJs() {
      if (!bootstrap) bootstrap = await buildBootstrapBundle();
      return bootstrap;
    },
    hostThemeCss() {
      if (!theme) theme = renderHostThemeCss();
      return theme;
    },
  };
}

function digest(text: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex").slice(0, 16);
}

function renderHostThemeCss(): ThemeCache {
  const dark = formatBlock(`[data-theme="dark"]`, HOST_THEME_DARK);
  const light = formatBlock(`[data-theme="light"]`, HOST_THEME_LIGHT);
  const css = `${dark}\n${light}\n`;
  return { css, digest: digest(css) };
}

function formatBlock(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `${selector} {\n${lines}\n}`;
}

function renderShellHtml(isDev: boolean): string {
  const vendorPrefix = isDev ? "/vendor/dev" : "/vendor/prod";
  const importmap: Record<string, string> = {};
  for (const spec of VENDOR_SPECIFIERS) {
    importmap[spec.specifier] = `${vendorPrefix}/${spec.filename}`;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>renderer</title>
<link rel="stylesheet" href="/host-theme.css">
<script type="importmap">${JSON.stringify({ imports: importmap })}</script>
<style>
  *,*::before,*::after { box-sizing: border-box; }
  html, body, #renderer-root {
    height: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
  }
  html { background: var(--color-void); color: var(--color-fg); font-family: var(--font-family-body); }
  body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--color-fg-4); border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--color-fg-3); }
</style>
<script type="module" src="/renderer-bootstrap.js"></script>
</head>
<body>
<div id="renderer-root"></div>
</body>
</html>
`;
}

async function buildBootstrapBundle(): Promise<BootstrapCache> {
  const entry = bootstrapEntryPath();
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
  });
  if (!result.success) {
    const messages = result.logs.map((l) => String(l.message ?? l)).join("\n");
    throw new Error(`renderer-bootstrap build failed:\n${messages}`);
  }
  const main = result.outputs.find((output) =>
    output.type.startsWith("text/javascript"),
  );
  if (!main) {
    throw new Error("renderer-bootstrap build produced no JS output");
  }
  const js = await main.text();
  // Bun.build emits an ES module with named declarations at top level. The
  // `bootIframeShell` symbol is a top-level binding in the bundle, so we can
  // invoke it from an appended line that runs as the module's last statement.
  const final = `${js}\nbootIframeShell();\n`;
  return { js: final, digest: digest(final) };
}

function bootstrapEntryPath(): string {
  // packages/renderer/src/iframe-bootstrap.ts — resolved relative to this
  // service module. import.meta.url is robust under both Bun --hot dev and
  // the compiled exe (where workspace deps are inlined).
  const here = fileURLToPath(import.meta.url);
  // here = .../apps/webui/src/server/services/host-shell.service.ts
  return resolve(
    here,
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
    "packages",
    "renderer",
    "src",
    "iframe-bootstrap.ts",
  );
}
