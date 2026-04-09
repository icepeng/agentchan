import { json } from "@/client/shared/api.js";
import type { ProviderInfo, ThinkingLevel, CustomProviderDef } from "@agentchan/creative-agent";

export interface ConfigResponse {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;
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

// --- Onboarding ---

export function fetchOnboardingStatus(): Promise<{ completed: boolean }> {
  return json("/config/onboarding");
}

export function completeOnboarding(): Promise<{ completed: boolean }> {
  return json("/config/onboarding", { method: "PUT" });
}
