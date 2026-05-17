import useSWR from "swr";
import type { ProviderInfo } from "@agentchan/creative-agent/browser";
import { qk } from "@/client/platform/index.js";
import { fetchConfig, type ConfigResponse } from "./active-model/config.api.js";
import { fetchProviders } from "./catalog/catalog.api.js";
import {
  fetchApiKeys,
  fetchOAuthStatus,
  type ApiKeyStatus,
  type OAuthStatus,
} from "./credentials/credentials.api.js";

export function useActiveModel() {
  const { data: config } = useSWR<ConfigResponse>(qk.config(), fetchConfig);
  const { data: providers = [] } = useProviders();
  const providerInfo = providers.find((p) => p.name === config?.provider);
  const modelInfo = providerInfo?.models.find((m) => m.id === config?.model);
  return { config, providerInfo, modelInfo };
}

export function useProviders() {
  return useSWR<ProviderInfo[]>(qk.providers(), fetchProviders);
}

export function useApiKeys() {
  return useSWR<ApiKeyStatus>(qk.apiKeys(), fetchApiKeys);
}

export function useOauthStatus(provider: string | null) {
  return useSWR<OAuthStatus>(
    provider ? qk.oauthStatus(provider) : null,
    ([, name]) => fetchOAuthStatus(String(name)),
  );
}
