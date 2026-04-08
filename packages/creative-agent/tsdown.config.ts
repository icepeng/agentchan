import { defineConfig } from "tsdown";

export default defineConfig({
  // Two entries: full server surface (./index.ts) and the browser-safe
  // subset (./client.ts). The client entry exists so webui's React code
  // can import slash/skill helpers without dragging the server-only
  // tools/* and skill-content-build modules (which use node:path/fs)
  // into the Vite bundle graph.
  entry: ["src/index.ts", "src/client.ts"],
  format: "esm",
  dts: true,
  clean: true,
  outDir: "dist",
});
