import { getProviders, getModels, type ModelInfo, type KnownProvider } from "@agentchan/creative-agent";
import type { ProviderInfo, CustomProviderDef } from "../types.js";
import type { SettingsRepo } from "../repositories/settings.repo.js";

type PiModel = ReturnType<typeof getModels>[number];

const BUILTIN_PROVIDERS = new Set([
  "google",
  "google-vertex",
  "openai",
  "anthropic",
  "vercel-ai-gateway",
  "zai",
  "github-copilot",
]);

const OAUTH_PROVIDER_NAMES = new Set(["github-copilot"]);

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

export const DEFAULT_PROVIDER = "google";

function toModelInfo(m: PiModel): ModelInfo {
  return {
    id: m.id,
    name: m.name,
    reasoning: m.reasoning,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
  };
}

function toCustomProviderInfo(provider: CustomProviderDef): ProviderInfo {
  return {
    name: provider.name,
    defaultModel: provider.models[0]?.id ?? "",
    models: provider.models.map((m) => ({ id: m.id, name: m.name, reasoning: false })),
    custom: { url: provider.url, format: provider.format },
  };
}

export function isOAuthProviderName(provider: string): boolean {
  return OAUTH_PROVIDER_NAMES.has(provider);
}

export function createProviderRegistry(
  settingsRepo: SettingsRepo,
  loadCustomProviders: () => CustomProviderDef[],
) {
  let providerListCache: ProviderInfo[] | null = null;

  function hasOAuthCredentials(provider: string): boolean {
    return settingsRepo.getOAuthCredentials(provider) != null;
  }

  function toBuiltInProviderInfo(name: KnownProvider): ProviderInfo {
    if (isOAuthProviderName(name)) {
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
  }

  function buildProviderList(): ProviderInfo[] {
    const builtIn = getProviders()
      .filter((name) => BUILTIN_PROVIDERS.has(name))
      .map(toBuiltInProviderInfo);
    const custom = loadCustomProviders().map(toCustomProviderInfo);
    return [...builtIn, ...custom];
  }

  function getProviderList(): ProviderInfo[] {
    if (!providerListCache) providerListCache = buildProviderList();
    return providerListCache;
  }

  return {
    getProviderList,

    findProvider(name: string): ProviderInfo | undefined {
      return getProviderList().find((p) => p.name === name);
    },

    isKnownProvider(name: string): boolean {
      return getProviderList().some((p) => p.name === name);
    },

    isAllowedBuiltinModel(model: string): boolean {
      return ALLOWED_MODELS.has(model);
    },

    isOAuthProvider: isOAuthProviderName,

    invalidate(): void {
      providerListCache = null;
    },
  };
}

export type ProviderRegistry = ReturnType<typeof createProviderRegistry>;
