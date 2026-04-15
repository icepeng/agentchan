import { Hono } from "hono";
import type { AppEnv } from "../types.js";

export function createUpdateRoutes() {
  const app = new Hono<AppEnv>();

  // Current status — cached up to 1 hour server-side.
  app.get("/", async (c) => {
    const force = c.req.query("force") === "1";
    const status = await c.get("updateService").getStatus(force);
    return c.json(status);
  });

  return app;
}
