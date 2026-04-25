import { getModel, type ThinkingLevel } from "@mariozechner/pi-ai";

export function mapThinkingLevel(level?: string): ThinkingLevel | undefined {
  if (!level || level === "off") return undefined;
  return level as ThinkingLevel;
}

export function resolveModel(
  provider: string,
  modelId: string,
  overrides?: { baseUrl?: string; apiFormat?: string },
) {
  // Custom provider with explicit baseUrl/apiFormat: build synthetic model
  if (overrides?.baseUrl && overrides?.apiFormat) {
    return {
      id: modelId,
      name: modelId,
      api: overrides.apiFormat as any,
      provider,
      baseUrl: overrides.baseUrl,
      reasoning: true,
      input: ["text"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_000,
    };
  }

  try {
    const model = getModel(provider as any, modelId as any);
    if (model) return model;
  } catch {
    // Fall through to synthetic model
  }
  const apiMap: Record<string, string> = {
    anthropic: "anthropic-messages",
    openai: "openai-completions",
    google: "google-generative-ai",
  };
  return {
    id: modelId,
    name: modelId,
    api: (apiMap[provider] ?? "openai-completions") as any,
    provider,
    baseUrl: "",
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_000,
  };
}
