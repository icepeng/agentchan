import type { CustomApiFormat } from "@agentchan/creative-agent";

/** Fallback when the active model has no `contextWindow` (e.g. custom provider). */
export const DEFAULT_CONTEXT_WINDOW = 128_000;
/** Fallback when the active model has no `maxTokens` (e.g. custom provider). */
export const DEFAULT_MAX_TOKENS = 16_000;

export const FORMAT_OPTIONS: { value: CustomApiFormat; label: string }[] = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "mistral-conversations", label: "Mistral Conversations" },
];
