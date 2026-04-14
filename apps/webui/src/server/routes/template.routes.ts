import { Hono } from "hono";
import type { AppEnv } from "../types.js";

export function createTemplateRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    return c.json(await c.get("templateService").list());
  });

  app.get("/:slug/cover", async (c) => {
    const slug = c.req.param("slug");
    const file = await c.get("templateService").getCoverFile(slug);
    if (!file) return c.json({ error: "No cover image" }, 404);
    return new Response(file, {
      headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=3600" },
    });
  });

  return app;
}
