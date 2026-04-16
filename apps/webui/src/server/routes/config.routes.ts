import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv, ServerConfig, CustomProviderDef } from "../types.js";

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

  // --- Custom Providers ---

  app.get("/custom-providers", (c) => {
    return c.json(c.get("configService").getCustomProviders());
  });

  app.put("/custom-providers", async (c) => {
    const provider = await c.req.json<CustomProviderDef>();
    return c.json(c.get("configService").saveCustomProvider(provider));
  });

  app.delete("/custom-providers/:name", (c) => {
    return c.json(c.get("configService").deleteCustomProvider(c.req.param("name")));
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

  // --- OAuth ---

  app.get("/oauth/:provider", (c) => {
    const provider = c.req.param("provider");
    return c.json(c.get("configService").getOAuthStatus(provider));
  });

  app.post("/oauth/:provider/login", (c) => {
    const provider = c.req.param("provider");
    const signal = c.req.raw.signal;
    return streamSSE(c, async (stream) => {
      try {
        await c.get("configService").startOAuthLogin(provider, {
          onAuth: (info) => {
            void stream.writeSSE({ event: "auth", data: JSON.stringify(info) });
          },
          onPrompt: () => Promise.resolve(""),
          onProgress: (message: string) => {
            void stream.writeSSE({ event: "progress", data: message });
          },
          signal,
        });
        const status = c.get("configService").getOAuthStatus(provider);
        await stream.writeSSE({ event: "done", data: JSON.stringify(status) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await stream.writeSSE({ event: "error", data: message });
      }
    });
  });

  app.delete("/oauth/:provider", (c) => {
    const provider = c.req.param("provider");
    c.get("configService").logoutOAuth(provider);
    return c.json(c.get("configService").getOAuthStatus(provider));
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
