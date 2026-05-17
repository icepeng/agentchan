import { json } from "@/client/platform/index.js";
import type { CustomProviderDef, ProviderInfo } from "@agentchan/creative-agent/browser";

export function fetchProviders(): Promise<ProviderInfo[]> {
  return json("/config/providers");
}

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
