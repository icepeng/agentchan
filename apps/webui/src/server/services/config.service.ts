import { getProviders, getModels } from "@agentchan/creative-agent";
import type { ServerConfig, ProviderInfo, CustomProviderDef } from "../types.js";
import type { SettingsRepo } from "../repositories/settings.repo.js";

const BUILTIN_PROVIDERS = new Set(["google", "google-vertex", "openai", "anthropic", "vercel-ai-gateway"]);

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
  // Vercel AI Gateway
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-haiku-4-5",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/o4-mini",
  "openai/o3-mini",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-flash",
  "google/gemini-3.1-flash-lite-preview",
  "deepseek/deepseek-v3.2",
  "xai/grok-4.1-fast-non-reasoning",
]);

const DEFAULT_PROVIDER = "google";

export function createConfigService(settingsRepo: SettingsRepo) {
  // --- Custom providers persistence ---

  function loadCustomProviders(): CustomProviderDef[] {
    const raw = settingsRepo.getAppSetting("custom-providers");
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  function saveCustomProviders(providers: CustomProviderDef[]): void {
    settingsRepo.setAppSetting("custom-providers", JSON.stringify(providers));
  }

  function buildProviderList(): ProviderInfo[] {
    const builtIn: ProviderInfo[] = getProviders()
      .filter((name) => BUILTIN_PROVIDERS.has(name))
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

    const custom: ProviderInfo[] = loadCustomProviders().map((p) => ({
      name: p.name,
      defaultModel: p.models[0]?.id ?? "",
      models: p.models.map((m) => ({ id: m.id, name: m.name, reasoning: false })),
      custom: { url: p.url, format: p.format },
    }));

    return [...builtIn, ...custom];
  }

  let providerListCache: ProviderInfo[] | null = null;
  function getProviderList(): ProviderInfo[] {
    if (!providerListCache) providerListCache = buildProviderList();
    return providerListCache;
  }

  function invalidateProviderCache(): void {
    providerListCache = null;
  }

  function findProvider(name: string): ProviderInfo | undefined {
    return getProviderList().find((p) => p.name === name);
  }

  function isKnownProvider(name: string): boolean {
    return getProviderList().some((p) => p.name === name);
  }

  function loadConfig(): ServerConfig {
    const savedProvider = settingsRepo.getAppSetting("config.provider");
    const savedModel = settingsRepo.getAppSetting("config.model");
    const provider = savedProvider && isKnownProvider(savedProvider) ? savedProvider : DEFAULT_PROVIDER;
    const providerInfo = getProviderList().find((p) => p.name === provider);

    let model: string;
    if (providerInfo?.custom) {
      // Custom providers: accept any saved model, fallback to default
      model = savedModel ?? (providerInfo?.defaultModel ?? "");
    } else {
      model = savedModel && ALLOWED_MODELS.has(savedModel) ? savedModel : (providerInfo?.defaultModel ?? "");
    }
    return { provider, model };
  }

  const currentConfig: ServerConfig = loadConfig();

  return {
    getConfig(): ServerConfig {
      return { ...currentConfig };
    },

    updateConfig(body: Partial<ServerConfig>): ServerConfig {
      if (body.provider) {
        currentConfig.provider = body.provider;
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

      settingsRepo.setAppSetting("config.provider", currentConfig.provider);
      settingsRepo.setAppSetting("config.model", currentConfig.model);

      return { ...currentConfig };
    },

    getProviderList,

    findProvider,

    // --- Custom Providers ---

    getCustomProviders(): CustomProviderDef[] {
      return loadCustomProviders();
    },

    saveCustomProvider(provider: CustomProviderDef): CustomProviderDef[] {
      const providers = loadCustomProviders();
      const idx = providers.findIndex((p) => p.name === provider.name);
      if (idx >= 0) {
        providers[idx] = provider;
      } else {
        providers.push(provider);
      }
      saveCustomProviders(providers);
      invalidateProviderCache();
      return providers;
    },

    deleteCustomProvider(name: string): CustomProviderDef[] {
      const providers = loadCustomProviders().filter((p) => p.name !== name);
      saveCustomProviders(providers);
      invalidateProviderCache();
      // If active provider was deleted, reset to default
      if (currentConfig.provider === name) {
        currentConfig.provider = DEFAULT_PROVIDER;
        const providerInfo = getProviderList().find((p) => p.name === DEFAULT_PROVIDER);
        currentConfig.model = providerInfo?.defaultModel ?? "";
        settingsRepo.setAppSetting("config.provider", currentConfig.provider);
        settingsRepo.setAppSetting("config.model", currentConfig.model);
      }
      return providers;
    },

    // --- API Keys ---

    getApiKey(provider: string): string | null {
      return settingsRepo.getApiKey(provider);
    },

    getAllApiKeys(): Record<string, string> {
      return settingsRepo.getAllApiKeys();
    },

    setApiKey(provider: string, key: string): Record<string, string> {
      settingsRepo.setApiKey(provider, key);
      return settingsRepo.getAllApiKeys();
    },

    deleteApiKey(provider: string): Record<string, string> {
      settingsRepo.deleteApiKey(provider);
      return settingsRepo.getAllApiKeys();
    },

    isOnboardingCompleted(): boolean {
      return settingsRepo.getAppSetting("onboarding-completed") === "true";
    },

    completeOnboarding(): void {
      settingsRepo.setAppSetting("onboarding-completed", "true");
    },
  };
}

export type ConfigService = ReturnType<typeof createConfigService>;
