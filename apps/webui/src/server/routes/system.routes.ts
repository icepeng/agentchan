import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { RENDERER_RUNTIME_ENTRY, RENDERER_TYPES_ENTRY } from "../paths.js";

async function loadAsset(path: string): Promise<string | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : null;
}

export async function createSystemRoutes() {
  const app = new Hono<AppEnv>();

  const assets: Array<{ route: string; body: string | null }> = await Promise.all(
    [
      { route: "/renderer-types.ts", path: RENDERER_TYPES_ENTRY },
      { route: "/renderer-runtime.ts", path: RENDERER_RUNTIME_ENTRY },
    ].map(async ({ route, path }) => ({ route, body: await loadAsset(path) })),
  );

  for (const { route, body } of assets) {
    app.get(route, (c) => {
      if (body === null) return c.text("", 404);
      return new Response(body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    });
  }

  return app;
}
