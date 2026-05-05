import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { VENDOR_SPECIFIERS } from "@agentchan/renderer-vendor";
import { resolveDevPorts } from "./scripts/dev-ports.js";

const { serverPort, clientPort } = resolveDevPorts();

/**
 * Injects a `<script type="importmap">` that resolves the renderer's baseline
 * vendor specifiers to the install-wide vendor fixtures emitted by
 * `@agentchan/renderer-vendor`. The renderer bundle leaves these specifiers as
 * external ESM imports; the importmap lets the same bare names resolve inside
 * blob-URL renderer modules without the bundle inlining its own React copy.
 *
 * Dev points at `/vendor/dev/`, build points at `/vendor/prod/`. Both are served
 * from `apps/webui/public/vendor/{dev,prod}/`. Auto-build wiring for the
 * fixtures lives in separate slices (#163 dev, #164 release).
 */
function rendererVendorImportmap(): Plugin {
  let isDev = false;
  return {
    name: "agentchan-renderer-vendor-importmap",
    configResolved(config) {
      isDev = config.command === "serve";
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const prefix = isDev ? "/vendor/dev" : "/vendor/prod";
        const imports: Record<string, string> = {};
        for (const spec of VENDOR_SPECIFIERS) {
          imports[spec.specifier] = `${prefix}/${spec.filename}`;
        }
        const tag = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
        return html.replace("</head>", `    ${tag}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    rendererVendorImportmap(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  root: ".",
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // CodeMirror is only used by the lazy-loaded Library page.
              // Force it into its own chunk so it's not in the main bundle.
              name: "codemirror",
              test: /node_modules[\\/](?:@codemirror|@lezer)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    // CodeMirror facets/decorations rely on module identity. Without dedupe,
    // monorepo hoisting can produce two `@codemirror/view` instances (one for
    // the app, one nested under lang-* packages) and `state.facet(...)` returns
    // an empty set — token spans never get emitted.
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@lezer/common",
      "@lezer/highlight",
    ],
  },
  server: {
    watch: {
      ignored: ["**/data/**", "**/example_data/**"],
    },
    host: "127.0.0.1",
    port: clientPort,
    proxy: {
      "/api": `http://127.0.0.1:${serverPort}`,
    },
  },
});
