import type { OAuthStatus } from "@/client/entities/config/index.js";

const PROVIDER_LABELS: Record<string, string> = {
  "github-copilot": "GitHub Copilot",
};

export function providerLabel(name: string): string {
  return PROVIDER_LABELS[name] ?? name;
}

export function isOAuthActive(status: OAuthStatus | null | undefined): boolean {
  if (!status?.signedIn) return false;
  return status.expiresAt === undefined || status.expiresAt > Date.now();
}

export function formatExpires(expiresAt: number | undefined): string {
  if (!expiresAt) return "";
  const deltaMs = expiresAt - Date.now();
  if (deltaMs <= 0) return "";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}
