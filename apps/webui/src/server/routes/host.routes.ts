import { Hono } from "hono";
import { join } from "node:path";
import type { AppEnv } from "../types.js";
import { PUBLIC_SOURCE_DIR } from "../paths.js";

/**
 * Self-origin static assets consumable by renderer iframes. The renderer
 * reaches these through `/api/host/...` so CSP's `'self'` directive covers
 * them without any additional allowedDomains entries.
 */
export function createHostRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/tokens.css", async (c) => {
    const file = Bun.file(join(PUBLIC_SOURCE_DIR, "host", "tokens.css"));
    if (!(await file.exists())) return c.json({ error: "tokens.css missing" }, 404);
    return new Response(file, {
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  });

  app.get("/lib/idiomorph.js", async (c) => {
    const file = Bun.file(join(PUBLIC_SOURCE_DIR, "lib", "idiomorph.js"));
    if (!(await file.exists())) return c.json({ error: "idiomorph.js missing" }, 404);
    return new Response(file, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  return app;
}
