import type { CustomApiFormat } from "@agentchan/creative-agent";

export const FORMAT_OPTIONS: { value: CustomApiFormat; label: string }[] = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "mistral-conversations", label: "Mistral Conversations" },
];
