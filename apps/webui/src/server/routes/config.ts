import { Hono } from "hono";
import type { ServerConfig, ProviderInfo } from "../types.js";
import { getProviders, getModels } from "@agentchan/creative-agent";
import { getAllApiKeys, setApiKey, deleteApiKey, getAppSetting, setAppSetting } from "../services/settings-db.js";

const ALLOWED_PROVIDERS = new Set(["google", "google-vertex", "openai", "anthropic"]);

const ALLOWED_MODELS = new Set([
  // Anthropic
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  // Google
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  // OpenAI
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.2",
  "gpt-5.1",
  "o4-mini",
  "o3-mini",
]);

function buildProviderList(): ProviderInfo[] {
  return getProviders()
    .filter((name) => ALLOWED_PROVIDERS.has(name))
    .map((name) => {
      const models = getModels(name)
        .filter((m) => ALLOWED_MODELS.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          reasoning: m.reasoning,
        }));
      return {
        name,
        defaultModel: models[0]?.id ?? "",
        models,
      };
    });
}

let providerListCache: ProviderInfo[] | null = null;
function getProviderList(): ProviderInfo[] {
  if (!providerListCache) providerListCache = buildProviderList();
  return providerListCache;
}

const DEFAULT_PROVIDER = "google";

function loadConfig(): ServerConfig {
  const savedProvider = getAppSetting("config.provider");
  const savedModel = getAppSetting("config.model");
  const provider = savedProvider && ALLOWED_PROVIDERS.has(savedProvider) ? savedProvider : DEFAULT_PROVIDER;
  const providerInfo = getProviderList().find((p) => p.name === provider);
  const model = savedModel && ALLOWED_MODELS.has(savedModel) ? savedModel : (providerInfo?.defaultModel ?? "");
  return { provider, model };
}

const currentConfig: ServerConfig = loadConfig();

export function getConfig(): ServerConfig {
  return { ...currentConfig };
}

const app = new Hono();

app.get("/", (c) => {
  return c.json(currentConfig);
});

app.put("/", async (c) => {
  const body = await c.req.json<Partial<ServerConfig>>();

  if (body.provider) {
    currentConfig.provider = body.provider;
    // Reset model to default if provider changed and no model specified
    if (!body.model) {
      const providerInfo = getProviderList().find((p) => p.name === body.provider);
      currentConfig.model = providerInfo?.defaultModel ?? currentConfig.model;
    }
  }
  if (body.model) {
    currentConfig.model = body.model;
  }
  if (body.temperature !== undefined) {
    currentConfig.temperature = body.temperature ?? undefined;
  }
  if (body.maxTokens !== undefined) {
    currentConfig.maxTokens = body.maxTokens ?? undefined;
  }
  if (body.contextWindow !== undefined) {
    currentConfig.contextWindow = body.contextWindow ?? undefined;
  }
  if (body.thinkingLevel !== undefined) {
    currentConfig.thinkingLevel = body.thinkingLevel ?? undefined;
  }

  setAppSetting("config.provider", currentConfig.provider);
  setAppSetting("config.model", currentConfig.model);

  return c.json(currentConfig);
});

app.get("/providers", (c) => {
  return c.json(getProviderList());
});

// --- API Keys ---

app.get("/api-keys", (c) => {
  return c.json(getAllApiKeys());
});

app.put("/api-keys", async (c) => {
  const { provider, key } = await c.req.json<{ provider: string; key: string }>();
  setApiKey(provider, key);
  return c.json(getAllApiKeys());
});

app.delete("/api-keys/:provider", (c) => {
  deleteApiKey(c.req.param("provider"));
  return c.json(getAllApiKeys());
});

// --- Onboarding ---

app.get("/onboarding", (c) => {
  const completed = getAppSetting("onboarding-completed") === "true";
  return c.json({ completed });
});

app.put("/onboarding", (c) => {
  setAppSetting("onboarding-completed", "true");
  return c.json({ completed: true });
});

export default app;
