import type { SlashCommandInfo } from "@agentchan/creative-agent/client";

/**
 * Built-in client command — executed locally by the chat input (e.g. /clear,
 * /compact). These never reach the server: they manipulate UI/session state
 * in-process. Each command may take an inline argument; if so, `needsArg` is
 * true and `argPlaceholder` is shown in the autocomplete popup.
 *
 * `source: "local"` discriminates these from `SlashCommandInfo` (domain-routed
 * slash commands owned by creative-agent). Adding a new domain source — tool,
 * agent, mcp — does NOT touch this file: SlashEntry's other arm widens
 * automatically because it's just `SlashCommandInfo`.
 */
export interface LocalCommand {
  source: "local";
  name: string;
  description: string;
  needsArg: boolean;
  argPlaceholder?: string;
}

/**
 * Anything that can appear in the slash autocomplete popup. The discriminator
 * is `source`: `"local"` means the client handles it in-process, anything else
 * is a domain-routed catalog entry that the user submits as text and the
 * server expands.
 */
export type SlashEntry = LocalCommand | SlashCommandInfo;

export const COMMANDS: LocalCommand[] = [
  { source: "local", name: "new", description: "Create new session", needsArg: false },
  { source: "local", name: "clear", description: "Clear / new session", needsArg: false },
  { source: "local", name: "compact", description: "Summarize and continue in new session", needsArg: false },
  { source: "local", name: "model", description: "Change model", needsArg: true, argPlaceholder: "<model-name>" },
  { source: "local", name: "provider", description: "Change provider", needsArg: true, argPlaceholder: "<provider-name>" },
  { source: "local", name: "help", description: "Show available commands", needsArg: false },
];
