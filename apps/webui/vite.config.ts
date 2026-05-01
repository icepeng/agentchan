import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { resolveDevPorts } from "./scripts/dev-ports.js";

const { serverPort, clientPort } = resolveDevPorts();

export default defineConfig({
  plugins: [
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
