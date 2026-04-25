import { getModels } from "@agentchan/creative-agent";
import {
  getOAuthApiKey,
  getOAuthProvider,
  getGitHubCopilotBaseUrl,
  type OAuthLoginCallbacks,
} from "@mariozechner/pi-ai/oauth";
import type { ServerConfig, CustomProviderDef } from "../types.js";
import type { SettingsRepo } from "../repositories/settings.repo.js";
import { createProviderRegistry } from "./config.providers.js";
import { createConfigState, createCustomProviderStore } from "./config.persistence.js";

const COPILOT_HEADERS: Record<string, string> = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

async function enableAllCopilotModels(token: string): Promise<void> {
  const baseUrl = getGitHubCopilotBaseUrl(token);
  await Promise.all(
    getModels("github-copilot").map(async (m) => {
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
  const customProviders = createCustomProviderStore(settingsRepo);
  const providerRegistry = createProviderRegistry(settingsRepo, customProviders.load);
  const configState = createConfigState(settingsRepo, providerRegistry);

  function resetActiveProvider(provider: string): void {
    providerRegistry.invalidate();
    configState.resetIfActiveProvider(provider);
  }

  return {
    getConfig(): ServerConfig {
      return configState.getConfig();
    },

    updateConfig(body: Partial<ServerConfig>): ServerConfig {
      return configState.updateConfig(body);
    },

    getProviderList() {
      return providerRegistry.getProviderList();
    },

    findProvider(name: string) {
      return providerRegistry.findProvider(name);
    },

    // --- Custom Providers ---

    getCustomProviders(): CustomProviderDef[] {
      return customProviders.load();
    },

    saveCustomProvider(provider: CustomProviderDef): CustomProviderDef[] {
      const providers = customProviders.saveProvider(provider);
      providerRegistry.invalidate();
      return providers;
    },

    deleteCustomProvider(name: string): CustomProviderDef[] {
      const providers = customProviders.deleteProvider(name);
      resetActiveProvider(name);
      return providers;
    },

    // --- API Keys ---

    getApiKey(provider: string): string | null {
      if (providerRegistry.isOAuthProvider(provider)) {
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
      return providerRegistry.isOAuthProvider(provider);
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
      providerRegistry.invalidate();
      if (provider === "github-copilot") {
        callbacks.onProgress?.("enabling models");
        await enableAllCopilotModels(creds.access);
      }
    },

    logoutOAuth(provider: string): void {
      settingsRepo.deleteOAuthCredentials(provider);
      resetActiveProvider(provider);
    },

    /**
     * Refresh OAuth token if needed and persist updated credentials.
     * No-op for non-OAuth providers. Called before agent prompts so the sync
     * `resolveAgentConfig` can read a fresh access token straight from the DB.
     */
    async ensureOAuthToken(provider: string): Promise<void> {
      if (!providerRegistry.isOAuthProvider(provider)) return;
      const creds = settingsRepo.getOAuthCredentials(provider);
      if (!creds) return;
      const result = await getOAuthApiKey(provider, { [provider]: creds });
      if (!result) return;
      // pi-ai returns the same reference when the token was still valid, and a
      // new object when it was refreshed, so identity compare is enough here.
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
