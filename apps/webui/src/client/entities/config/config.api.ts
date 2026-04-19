import { json, parseSSEStream, BASE } from "@/client/shared/api.js";
import type { ProviderInfo, ThinkingLevel, CustomProviderDef } from "@agentchan/creative-agent";

export interface ConfigResponse {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel: ThinkingLevel;
}

export function fetchConfig(): Promise<ConfigResponse> {
  return json("/config");
}

export function updateConfig(config: {
  provider?: string;
  model?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  contextWindow?: number | null;
  thinkingLevel?: ThinkingLevel | null;
}): Promise<ConfigResponse> {
  return json("/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export function fetchProviders(): Promise<ProviderInfo[]> {
  return json("/config/providers");
}

// --- Custom Providers ---

export function saveCustomProvider(provider: CustomProviderDef): Promise<CustomProviderDef[]> {
  return json("/config/custom-providers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider),
  });
}

export function deleteCustomProvider(name: string): Promise<CustomProviderDef[]> {
  return json(`/config/custom-providers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

// --- API Keys ---

export interface ApiKeyStatus {
  [provider: string]: string;
}

export function fetchApiKeys(): Promise<ApiKeyStatus> {
  return json("/config/api-keys");
}

export function updateApiKey(provider: string, key: string): Promise<ApiKeyStatus> {
  return json("/config/api-keys", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key }),
  });
}

export function deleteApiKey(provider: string): Promise<ApiKeyStatus> {
  return json(`/config/api-keys/${encodeURIComponent(provider)}`, {
    method: "DELETE",
  });
}

// --- OAuth ---

export interface OAuthStatus {
  signedIn: boolean;
  expiresAt?: number;
  enterpriseUrl?: string;
}

export interface OAuthAuthInfo {
  url: string;
  instructions?: string;
}

export interface LoginOAuthCallbacks {
  onAuth: (info: OAuthAuthInfo) => void;
  onProgress?: (message: string) => void;
  onDone: (status: OAuthStatus) => void | Promise<void>;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

export function fetchOAuthStatus(provider: string): Promise<OAuthStatus> {
  return json(`/config/oauth/${encodeURIComponent(provider)}`);
}

export function logoutOAuth(provider: string): Promise<OAuthStatus> {
  return json(`/config/oauth/${encodeURIComponent(provider)}`, { method: "DELETE" });
}

export async function loginOAuthStream(
  provider: string,
  { onAuth, onProgress, onDone, onError, signal }: LoginOAuthCallbacks,
): Promise<void> {
  const res = await fetch(`${BASE}/config/oauth/${encodeURIComponent(provider)}/login`, {
    method: "POST",
    signal,
  });
  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    return;
  }
  await parseSSEStream(res.body, (event, data) => {
    switch (event) {
      case "auth":
        try {
          onAuth(JSON.parse(data) as OAuthAuthInfo);
        } catch {
          onError("Failed to parse auth event");
        }
        return;
      case "progress":
        onProgress?.(data);
        return;
      case "done":
        try {
          void onDone(JSON.parse(data) as OAuthStatus);
        } catch {
          void onDone({ signedIn: true });
        }
        return;
      case "error":
        onError(data);
        return;
    }
  });
}

// --- Onboarding ---

export function fetchOnboardingStatus(): Promise<{ completed: boolean }> {
  return json("/config/onboarding");
}

export function completeOnboarding(): Promise<{ completed: boolean }> {
  return json("/config/onboarding", { method: "PUT" });
}
