import { getProviders, getModels } from "@agentchan/creative-agent";
import type { ServerConfig, ProviderInfo } from "../types.js";
import type { SettingsRepo } from "../repositories/settings.repo.js";

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

const DEFAULT_PROVIDER = "google";

export function createConfigService(settingsRepo: SettingsRepo) {
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

  function loadConfig(): ServerConfig {
    const savedProvider = settingsRepo.getAppSetting("config.provider");
    const savedModel = settingsRepo.getAppSetting("config.model");
    const provider = savedProvider && ALLOWED_PROVIDERS.has(savedProvider) ? savedProvider : DEFAULT_PROVIDER;
    const providerInfo = getProviderList().find((p) => p.name === provider);
    const model = savedModel && ALLOWED_MODELS.has(savedModel) ? savedModel : (providerInfo?.defaultModel ?? "");
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
