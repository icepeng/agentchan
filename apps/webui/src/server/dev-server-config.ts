import type { Server } from "node:http";
import type { InlineConfig } from "vite";

export function createViteDevServerConfig(hmrServer: Server, port: number): InlineConfig {
  return {
    server: {
      port,
      middlewareMode: true,
      hmr: { server: hmrServer },
      watch: { ignored: ["**/data/**", "**/example_data/**"] },
    },
    appType: "spa",
  };
}
