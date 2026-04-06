import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import type { ServerConfig } from "../types.js";

export function createConfigRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => {
    return c.json(c.get("configService").getConfig());
  });

  app.put("/", async (c) => {
    const body = await c.req.json<Partial<ServerConfig>>();
    return c.json(c.get("configService").updateConfig(body));
  });

  app.get("/providers", (c) => {
    return c.json(c.get("configService").getProviderList());
  });

  // --- API Keys ---

  app.get("/api-keys", (c) => {
    return c.json(c.get("configService").getAllApiKeys());
  });

  app.put("/api-keys", async (c) => {
    const { provider, key } = await c.req.json<{ provider: string; key: string }>();
    return c.json(c.get("configService").setApiKey(provider, key));
  });

  app.delete("/api-keys/:provider", (c) => {
    return c.json(c.get("configService").deleteApiKey(c.req.param("provider")));
  });

  // --- Onboarding ---

  app.get("/onboarding", (c) => {
    return c.json({ completed: c.get("configService").isOnboardingCompleted() });
  });

  app.put("/onboarding", (c) => {
    c.get("configService").completeOnboarding();
    return c.json({ completed: true });
  });

  return app;
}
