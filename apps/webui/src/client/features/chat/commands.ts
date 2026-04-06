export interface SlashCommand {
  name: string;
  description: string;
  needsArg: boolean;
  argPlaceholder?: string;
  kind: "command" | "skill";
}

export const COMMANDS: SlashCommand[] = [
  { name: "new", description: "Create new session", needsArg: false, kind: "command" },
  { name: "clear", description: "Clear / new session", needsArg: false, kind: "command" },
  { name: "compact", description: "Summarize and continue in new session", needsArg: false, kind: "command" },
  { name: "model", description: "Change model", needsArg: true, argPlaceholder: "<model-name>", kind: "command" },
  { name: "provider", description: "Change provider", needsArg: true, argPlaceholder: "<provider-name>", kind: "command" },
  { name: "help", description: "Show available commands", needsArg: false, kind: "command" },
];
