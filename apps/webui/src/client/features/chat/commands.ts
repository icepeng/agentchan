/**
 * Built-in client command — executed locally by the chat input (e.g. /clear,
 * /compact). Each command may take an inline argument; if so, `needsArg` is
 * true and `argPlaceholder` is shown in the autocomplete popup.
 */
export interface CommandSlash {
  type: "command";
  name: string;
  description: string;
  needsArg: boolean;
  argPlaceholder?: string;
}

/**
 * Slash-invocable project skill (sourced from the project's SkillContext).
 * The server expands these into the full skill body — the client only owns
 * the autocomplete UX and forwards `/skillname [args]` to sendMessage.
 */
export interface SkillSlash {
  type: "skill";
  name: string;
  description: string;
}

/**
 * Discriminated union of all slash entries shown in the autocomplete popup.
 * Use `type` to discriminate when handling. New entry kinds (mcp, agent, ...)
 * can be added as additional variants without touching existing branches.
 */
export type SlashCommand = CommandSlash | SkillSlash;

export const COMMANDS: CommandSlash[] = [
  { type: "command", name: "new", description: "Create new session", needsArg: false },
  { type: "command", name: "clear", description: "Clear / new session", needsArg: false },
  { type: "command", name: "compact", description: "Summarize and continue in new session", needsArg: false },
  { type: "command", name: "model", description: "Change model", needsArg: true, argPlaceholder: "<model-name>" },
  { type: "command", name: "provider", description: "Change provider", needsArg: true, argPlaceholder: "<provider-name>" },
  { type: "command", name: "help", description: "Show available commands", needsArg: false },
];
