export interface SlashCommand {
  name: string;
  description: string;
  needsArg: boolean;
  argPlaceholder?: string;
}

export const COMMANDS: SlashCommand[] = [
  { name: "new", description: "Create new session", needsArg: false },
  { name: "clear", description: "Clear / new session", needsArg: false },
  { name: "compact", description: "Summarize and continue in new session", needsArg: false },
  { name: "model", description: "Change model", needsArg: true, argPlaceholder: "<model-name>" },
  { name: "provider", description: "Change provider", needsArg: true, argPlaceholder: "<provider-name>" },
  { name: "help", description: "Show available commands", needsArg: false },
];
