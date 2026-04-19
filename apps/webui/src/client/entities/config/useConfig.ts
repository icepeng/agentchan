import useSWR, { useSWRConfig } from "swr";
import type { ProviderInfo, CustomProviderDef } from "@agentchan/creative-agent";
import { qk } from "@/client/shared/queryKeys.js";
import {
  updateConfig as apiUpdateConfig,
  saveCustomProvider as apiSaveCustomProvider,
  deleteCustomProvider as apiDeleteCustomProvider,
  updateApiKey as apiUpdateApiKey,
  deleteApiKey as apiDeleteApiKey,
  logoutOAuth as apiLogoutOAuth,
  loginOAuthStream as apiLoginOAuthStream,
  completeOnboarding as apiCompleteOnboarding,
  type ConfigResponse,
  type ApiKeyStatus,
  type OAuthStatus,
  type LoginOAuthCallbacks,
} from "./config.api.js";

export function useConfig() {
  return useSWR<ConfigResponse>(qk.config());
}

export function useProviders() {
  return useSWR<ProviderInfo[]>(qk.providers());
}

/**
 * Resolve the ProviderInfo + ModelInfo objects pointed to by the active config.
 * Returns `undefined` for either piece while the SWR caches are still loading
 * or when the saved id no longer exists in the catalog (deleted custom provider,
 * model removed from ALLOWED_MODELS, etc.).
 */
export function useCurrentModel() {
  const { data: config } = useConfig();
  const { data: providers = [] } = useProviders();
  const provider = providers.find((p) => p.name === config?.provider);
  const model = provider?.models.find((m) => m.id === config?.model);
  return { provider, model };
}

export function useApiKeys() {
  return useSWR<ApiKeyStatus>(qk.apiKeys());
}

export function useOauthStatus(provider: string | null) {
  return useSWR<OAuthStatus>(provider ? qk.oauthStatus(provider) : null);
}

export function useOnboarding() {
  return useSWR<{ completed: boolean }>(qk.onboarding());
}

/**
 * Mutation bundle. `update` and `saveCustomProvider/deleteCustomProvider`
 * touch both `config` (effective model can shift) and `providers` (catalog
 * recomputed) so every mutation here invalidates both keys.
 */
export function useConfigMutations() {
  const { mutate } = useSWRConfig();

  const update = async (payload: Parameters<typeof apiUpdateConfig>[0]) => {
    const next = await apiUpdateConfig(payload);
    await mutate(qk.config(), next, { revalidate: false });
    return next;
  };

  const saveCustomProvider = async (provider: CustomProviderDef) => {
    const list = await apiSaveCustomProvider(provider);
    await mutate(qk.providers());
    await mutate(qk.config());
    return list;
  };

  const deleteCustomProvider = async (name: string) => {
    const list = await apiDeleteCustomProvider(name);
    await mutate(qk.providers());
    await mutate(qk.config());
    return list;
  };

  const updateApiKey = async (provider: string, key: string) => {
    const next = await apiUpdateApiKey(provider, key);
    await mutate(qk.apiKeys(), next, { revalidate: false });
    await mutate(qk.providers());
    return next;
  };

  const deleteApiKey = async (provider: string) => {
    const next = await apiDeleteApiKey(provider);
    await mutate(qk.apiKeys(), next, { revalidate: false });
    await mutate(qk.providers());
    return next;
  };

  const logoutOAuth = async (provider: string) => {
    const next = await apiLogoutOAuth(provider);
    await mutate(qk.oauthStatus(provider), next, { revalidate: false });
    await mutate(qk.providers());
    return next;
  };

  const loginOAuth = async (provider: string, callbacks: LoginOAuthCallbacks) => {
    // Wrap onDone so it invalidates oauthStatus + providers after success.
    const wrapped: LoginOAuthCallbacks = {
      ...callbacks,
      onDone: async (status) => {
        await mutate(qk.oauthStatus(provider), status, { revalidate: false });
        await mutate(qk.providers());
        await callbacks.onDone(status);
      },
    };
    return apiLoginOAuthStream(provider, wrapped);
  };

  const completeOnboarding = async () => {
    const next = await apiCompleteOnboarding();
    await mutate(qk.onboarding(), next, { revalidate: false });
    return next;
  };

  return {
    update,
    saveCustomProvider,
    deleteCustomProvider,
    updateApiKey,
    deleteApiKey,
    logoutOAuth,
    loginOAuth,
    completeOnboarding,
  };
}
