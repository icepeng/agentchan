import { DEFAULT_THINKING_LEVEL } from "@agentchan/creative-agent";
import type { ServerConfig, CustomProviderDef } from "../types.js";
import type { SettingsRepo } from "../repositories/settings.repo.js";
import { DEFAULT_PROVIDER, type ProviderRegistry } from "./config.providers.js";

const CUSTOM_PROVIDERS_KEY = "custom-providers";

export function createCustomProviderStore(settingsRepo: SettingsRepo) {
  function load(): CustomProviderDef[] {
    const raw = settingsRepo.getAppSetting(CUSTOM_PROVIDERS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as CustomProviderDef[];
    } catch {
      return [];
    }
  }

  function save(providers: CustomProviderDef[]): void {
    settingsRepo.setAppSetting(CUSTOM_PROVIDERS_KEY, JSON.stringify(providers));
  }

  return {
    load,

    saveProvider(provider: CustomProviderDef): CustomProviderDef[] {
      const providers = load();
      const idx = providers.findIndex((p) => p.name === provider.name);
      if (idx >= 0) {
        providers[idx] = provider;
      } else {
        providers.push(provider);
      }
      save(providers);
      return providers;
    },

    deleteProvider(name: string): CustomProviderDef[] {
      const providers = load().filter((p) => p.name !== name);
      save(providers);
      return providers;
    },
  };
}

function loadNumber(
  settingsRepo: SettingsRepo,
  key: string,
  parse: (raw: string) => number,
  min: number,
  max?: number,
): number | undefined {
  const raw = settingsRepo.getAppSetting(key);
  if (raw == null) return undefined;
  const value = parse(raw);
  if (!Number.isFinite(value)) return undefined;
  if (value < min) return undefined;
  if (max !== undefined && value > max) return undefined;
  return value;
}

function loadThinkingLevel(settingsRepo: SettingsRepo) {
  const raw = settingsRepo.getAppSetting("config.thinkingLevel");
  if (raw === "off" || raw === "low" || raw === "medium" || raw === "high") return raw;
  return undefined;
}

function resolveSavedModel(
  savedModel: string | null,
  provider: string,
  registry: ProviderRegistry,
): string {
  const providerInfo = registry.findProvider(provider);
  if (providerInfo?.custom) {
    return savedModel ?? (providerInfo.defaultModel ?? "");
  }

  if (registry.isOAuthProvider(provider)) {
    const known = new Set(providerInfo?.models.map((m) => m.id) ?? []);
    return savedModel && known.has(savedModel) ? savedModel : (providerInfo?.defaultModel ?? "");
  }

  return savedModel && registry.isAllowedBuiltinModel(savedModel)
    ? savedModel
    : (providerInfo?.defaultModel ?? "");
}

function loadConfig(settingsRepo: SettingsRepo, registry: ProviderRegistry): ServerConfig {
  const savedProvider = settingsRepo.getAppSetting("config.provider");
  const savedModel = settingsRepo.getAppSetting("config.model");
  const provider = savedProvider && registry.isKnownProvider(savedProvider) ? savedProvider : DEFAULT_PROVIDER;

  return {
    provider,
    model: resolveSavedModel(savedModel, provider, registry),
    temperature: loadNumber(settingsRepo, "config.temperature", parseFloat, 0, 2),
    maxTokens: loadNumber(settingsRepo, "config.maxTokens", (s) => parseInt(s, 10), 1),
    contextWindow: loadNumber(settingsRepo, "config.contextWindow", (s) => parseInt(s, 10), 1024),
    thinkingLevel: loadThinkingLevel(settingsRepo) ?? DEFAULT_THINKING_LEVEL,
  };
}

export function createConfigState(settingsRepo: SettingsRepo, registry: ProviderRegistry) {
  const currentConfig: ServerConfig = loadConfig(settingsRepo, registry);

  function persistProviderAndModel(): void {
    settingsRepo.setAppSetting("config.provider", currentConfig.provider);
    settingsRepo.setAppSetting("config.model", currentConfig.model);
  }

  function setProviderToDefault(): void {
    currentConfig.provider = DEFAULT_PROVIDER;
    currentConfig.model = registry.findProvider(DEFAULT_PROVIDER)?.defaultModel ?? "";
    persistProviderAndModel();
  }

  function persistOptionalNumber(
    body: Partial<ServerConfig>,
    field: "temperature" | "maxTokens" | "contextWindow",
  ): void {
    if (!(field in body)) return;
    const key = `config.${field}`;
    const value = body[field];
    if (value == null) {
      currentConfig[field] = undefined;
      settingsRepo.deleteAppSetting(key);
    } else {
      currentConfig[field] = value;
      settingsRepo.setAppSetting(key, String(value));
    }
  }

  function persistThinkingLevel(body: Partial<ServerConfig>): void {
    if (!("thinkingLevel" in body)) return;
    const level = body.thinkingLevel;
    if (level == null) {
      currentConfig.thinkingLevel = DEFAULT_THINKING_LEVEL;
      settingsRepo.deleteAppSetting("config.thinkingLevel");
    } else {
      currentConfig.thinkingLevel = level;
      settingsRepo.setAppSetting("config.thinkingLevel", level);
    }
  }

  return {
    getConfig(): ServerConfig {
      return { ...currentConfig };
    },

    updateConfig(body: Partial<ServerConfig>): ServerConfig {
      if (body.provider) {
        currentConfig.provider = body.provider;
        if (!body.model) {
          currentConfig.model = registry.findProvider(body.provider)?.defaultModel ?? currentConfig.model;
        }
      }
      if (body.model) {
        currentConfig.model = body.model;
      }

      persistOptionalNumber(body, "temperature");
      persistOptionalNumber(body, "maxTokens");
      persistOptionalNumber(body, "contextWindow");
      persistThinkingLevel(body);
      persistProviderAndModel();

      return { ...currentConfig };
    },

    resetIfActiveProvider(provider: string): void {
      if (currentConfig.provider === provider) {
        setProviderToDefault();
      }
    },
  };
}
