import { BASE, json, parseSSEStream } from "@/client/platform/index.js";

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

export interface OAuthStatus {
  signedIn: boolean;
  expiresAt?: number;
  enterpriseUrl?: string;
}

export interface OAuthAuthInfo {
  url: string;
  instructions?: string;
}

export function fetchOAuthStatus(provider: string): Promise<OAuthStatus> {
  return json(`/config/oauth/${encodeURIComponent(provider)}`);
}

export interface LoginOAuthCallbacks {
  onAuth: (info: OAuthAuthInfo) => void;
  onProgress?: (message: string) => void;
  onDone: (status: OAuthStatus) => void | Promise<void>;
  onError: (message: string) => void;
  signal?: AbortSignal;
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
