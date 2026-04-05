import type { CustomApiFormat, CustomApiTokenizer } from "./config.types.js";

export const FORMAT_OPTIONS: { value: CustomApiFormat; label: string }[] = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "mistral-conversations", label: "Mistral Conversations" },
];

export const TOKENIZER_OPTIONS: { value: CustomApiTokenizer; label: string }[] = [
  { value: "cl100k", label: "cl100k (GPT-4)" },
  { value: "o200k", label: "o200k (GPT-4o)" },
  { value: "claude", label: "Claude" },
  { value: "llama3", label: "Llama 3" },
  { value: "unknown", label: "Unknown" },
];
