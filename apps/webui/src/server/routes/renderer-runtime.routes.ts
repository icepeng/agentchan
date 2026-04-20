import { Hono } from "hono";
import type { AppEnv } from "../types.js";

export function createRendererRuntimeRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/base.css", async (c) => {
    const css = await c.get("rendererRuntimeService").getBaseCss();
    return new Response(css, {
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  });

  return app;
}
