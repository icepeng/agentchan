import { getProviders, getModels, DEFAULT_THINKING_LEVEL, type ModelInfo } from "@agentchan/creative-agent";
import {
  getOAuthApiKey,
  getOAuthProvider,
  getGitHubCopilotBaseUrl,
  type OAuthLoginCallbacks,
} from "@mariozechner/pi-ai/oauth";
import type { ServerConfig, ProviderInfo, CustomProviderDef } from "../types.js";
import type { SettingsRepo } from "../repositories/settings.repo.js";

type PiModel = ReturnType<typeof getModels>[number];

function toModelInfo(m: PiModel): ModelInfo {
  return {
    id: m.id,
    name: m.name,
    reasoning: m.reasoning,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
  };
}

const BUILTIN_PROVIDERS = new Set([
  "google",
  "google-vertex",
  "openai",
  "anthropic",
  "vercel-ai-gateway",
  "zai",
  "github-copilot",
]);

const OAUTH_PROVIDERS = new Set(["github-copilot"]);

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
  // Z.ai
  "glm-5",
  "glm-5.1",
]);

const DEFAULT_PROVIDER = "google";

const COPILOT_HEADERS: Record<string, string> = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

async function enableAllCopilotModels(token: string): Promise<void> {
  const baseUrl = getGitHubCopilotBaseUrl(token);
  const models = getModels("github-copilot");
  await Promise.all(
    models.map(async (m) => {
      try {
        await fetch(`${baseUrl}/models/${m.id}/policy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...COPILOT_HEADERS,
            "openai-intent": "chat-policy",
            "x-interaction-type": "chat-policy",
          },
          body: JSON.stringify({ state: "enabled" }),
        });
      } catch {
        // Ignore per-model enable failures; user can still chat with models
        // GitHub already activated.
      }
    }),
  );
}

export type OAuthStatus = {
  signedIn: boolean;
  expiresAt?: number;
  enterpriseUrl?: string;
};

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

  function hasOAuthCredentials(provider: string): boolean {
    return settingsRepo.getOAuthCredentials(provider) != null;
  }

  function buildProviderList(): ProviderInfo[] {
    const builtIn: ProviderInfo[] = getProviders()
      .filter((name) => BUILTIN_PROVIDERS.has(name))
      .map((name) => {
        // OAuth provider (e.g. github-copilot): model list comes from pi-ai as-is,
        // but hidden until user signs in so selecting it can't silently fail.
        if (OAUTH_PROVIDERS.has(name)) {
          const models = hasOAuthCredentials(name) ? getModels(name).map(toModelInfo) : [];
          return { name, defaultModel: models[0]?.id ?? "", models, oauth: true };
        }
        const models = getModels(name)
          .filter((m) => ALLOWED_MODELS.has(m.id))
          .map(toModelInfo);
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

  function loadNumber(
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

  function loadThinkingLevel() {
    const raw = settingsRepo.getAppSetting("config.thinkingLevel");
    if (raw === "off" || raw === "low" || raw === "medium" || raw === "high") return raw;
    return undefined;
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
    } else if (OAUTH_PROVIDERS.has(provider)) {
      // OAuth providers: pi-ai is source of truth for model list, not ALLOWED_MODELS
      const known = new Set(providerInfo?.models.map((m) => m.id) ?? []);
      model = savedModel && known.has(savedModel) ? savedModel : (providerInfo?.defaultModel ?? "");
    } else {
      model = savedModel && ALLOWED_MODELS.has(savedModel) ? savedModel : (providerInfo?.defaultModel ?? "");
    }

    return {
      provider,
      model,
      temperature: loadNumber("config.temperature", parseFloat, 0, 2),
      maxTokens: loadNumber("config.maxTokens", (s) => parseInt(s, 10), 1),
      contextWindow: loadNumber("config.contextWindow", (s) => parseInt(s, 10), 1024),
      thinkingLevel: loadThinkingLevel() ?? DEFAULT_THINKING_LEVEL,
    };
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

      const persistNumber = (field: "temperature" | "maxTokens" | "contextWindow") => {
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
      };

      persistNumber("temperature");
      persistNumber("maxTokens");
      persistNumber("contextWindow");

      if ("thinkingLevel" in body) {
        const level = body.thinkingLevel;
        if (level == null) {
          currentConfig.thinkingLevel = DEFAULT_THINKING_LEVEL;
          settingsRepo.deleteAppSetting("config.thinkingLevel");
        } else {
          currentConfig.thinkingLevel = level;
          settingsRepo.setAppSetting("config.thinkingLevel", level);
        }
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
      if (OAUTH_PROVIDERS.has(provider)) {
        return settingsRepo.getOAuthCredentials(provider)?.access ?? null;
      }
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

    // --- OAuth ---

    isOAuthProvider(provider: string): boolean {
      return OAUTH_PROVIDERS.has(provider);
    },

    getOAuthStatus(provider: string): OAuthStatus {
      const creds = settingsRepo.getOAuthCredentials(provider);
      if (!creds) return { signedIn: false };
      return {
        signedIn: true,
        expiresAt: creds.expires,
        enterpriseUrl: typeof creds.enterpriseUrl === "string" ? creds.enterpriseUrl : undefined,
      };
    },

    async startOAuthLogin(provider: string, callbacks: OAuthLoginCallbacks): Promise<void> {
      const oauthProvider = getOAuthProvider(provider);
      if (!oauthProvider) {
        throw new Error(`Unknown OAuth provider: ${provider}`);
      }
      const creds = await oauthProvider.login(callbacks);
      settingsRepo.setOAuthCredentials(provider, creds);
      invalidateProviderCache();
      if (provider === "github-copilot") {
        callbacks.onProgress?.("enabling models");
        await enableAllCopilotModels(creds.access);
      }
    },

    logoutOAuth(provider: string): void {
      settingsRepo.deleteOAuthCredentials(provider);
      invalidateProviderCache();
      if (currentConfig.provider === provider) {
        currentConfig.provider = DEFAULT_PROVIDER;
        const providerInfo = getProviderList().find((p) => p.name === DEFAULT_PROVIDER);
        currentConfig.model = providerInfo?.defaultModel ?? "";
        settingsRepo.setAppSetting("config.provider", currentConfig.provider);
        settingsRepo.setAppSetting("config.model", currentConfig.model);
      }
    },

    /**
     * Refresh OAuth token if needed and persist updated credentials.
     * No-op for non-OAuth providers. Called before agent prompts so the sync
     * `resolveAgentConfig` can read a fresh access token straight from the DB.
     */
    async ensureOAuthToken(provider: string): Promise<void> {
      if (!OAUTH_PROVIDERS.has(provider)) return;
      const creds = settingsRepo.getOAuthCredentials(provider);
      if (!creds) return;
      const result = await getOAuthApiKey(provider, { [provider]: creds });
      if (!result) return;
      // pi-ai returns the same reference when the token was still valid, and a
      // new object when it was refreshed — so identity compare is enough here.
      if (result.newCredentials !== creds) {
        settingsRepo.setOAuthCredentials(provider, result.newCredentials);
      }
    },

    getResolvedBaseUrl(provider: string, apiKey: string | null): string | undefined {
      if (provider === "github-copilot" && apiKey) {
        return getGitHubCopilotBaseUrl(apiKey);
      }
      return undefined;
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
