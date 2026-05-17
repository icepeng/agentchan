import { useSWRConfig } from "swr";
import type { CustomProviderDef } from "@agentchan/creative-agent/browser";
import { qk } from "@/client/platform/index.js";
import {
  updateConfig as apiUpdateConfig,
} from "./active-model/config.api.js";
import {
  saveCustomProvider as apiSaveCustomProvider,
  deleteCustomProvider as apiDeleteCustomProvider,
} from "./catalog/catalog.api.js";
import {
  updateApiKey as apiUpdateApiKey,
  deleteApiKey as apiDeleteApiKey,
  logoutOAuth as apiLogoutOAuth,
  loginOAuthStream as apiLoginOAuthStream,
  type LoginOAuthCallbacks,
} from "./credentials/credentials.api.js";

export function useProviderMutations() {
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

  return {
    update,
    saveCustomProvider,
    deleteCustomProvider,
    updateApiKey,
    deleteApiKey,
    logoutOAuth,
    loginOAuth,
  };
}
