import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { readmeResponse } from "../readme.js";

export function createTemplateRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    return c.json(await c.get("templateService").list());
  });

  app.put("/order", async (c) => {
    const body = await c.req.json<{ order?: unknown[] }>().catch(() => null);
    if (!Array.isArray(body?.order)) {
      return c.json({ error: "Expected { order: string[] }" }, 400);
    }
    const order = body.order.filter((s): s is string => typeof s === "string");
    await c.get("templateService").saveOrder(order);
    return c.json({ ok: true });
  });

  app.get("/:slug/cover", async (c) => {
    const slug = c.req.param("slug");
    const file = await c.get("templateService").getCoverFile(slug);
    if (!file) return c.json({ error: "No cover image" }, 404);
    return new Response(file, {
      headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=3600" },
    });
  });

  app.get("/:slug/readme", async (c) => {
    const slug = c.req.param("slug");
    const raw = await c.get("templateService").getReadme(slug);
    return c.json(readmeResponse(raw));
  });

  app.post("/:slug/trust", (c) => {
    c.get("templateTrustService").setTrust(c.req.param("slug"), true);
    return c.json({ ok: true });
  });

  app.delete("/:slug/trust", (c) => {
    c.get("templateTrustService").setTrust(c.req.param("slug"), false);
    return c.json({ ok: true });
  });

  return app;
}
