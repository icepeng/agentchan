import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { createViteDevServerConfig } from "../../src/server/dev-server-config.js";

describe("dev server config", () => {
  test("mounts Vite HMR on the app HTTP server instead of a separate port", () => {
    const server = createServer();
    const config = createViteDevServerConfig(server, 4463);

    expect(config.server?.port).toBe(4463);
    expect(config.server?.middlewareMode).toBe(true);
    expect(config.server?.hmr).toMatchObject({ server });
    expect(config.server?.hmr).not.toHaveProperty("port");
    expect(config.server?.hmr).not.toHaveProperty("clientPort");
  });
});
