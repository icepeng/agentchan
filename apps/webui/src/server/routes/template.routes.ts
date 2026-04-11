import { Hono } from "hono";
import type { AppEnv } from "../types.js";

export function createTemplateRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    return c.json(await c.get("templateService").list());
  });

  return app;
}
