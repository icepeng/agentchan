import type { SkillMetadata } from "@/client/entities/skill/index.js";

export interface LocalSlashCommand {
  kind: "local";
  name: string;
  description: string;
  needsArg: boolean;
  argPlaceholder?: string;
}

export interface SkillSlashCommand {
  kind: "skill";
  name: string;
  description: string;
}

export type SlashEntry = LocalSlashCommand | SkillSlashCommand;

export const LOCAL_COMMANDS: LocalSlashCommand[] = [
  { kind: "local", name: "new", description: "Create new session", needsArg: false },
  { kind: "local", name: "compact", description: "Summarize and continue in new session", needsArg: false },
  { kind: "local", name: "model", description: "Change model", needsArg: true, argPlaceholder: "<model-name>" },
  { kind: "local", name: "provider", description: "Change provider", needsArg: true, argPlaceholder: "<provider-name>" },
];

// alwaysActive skills are excluded from the popup (their body is already
// loaded; invoking is redundant). disableModelInvocation skills are kept —
// the slash path is the only way the user can reach them.
export function buildSlashEntries(skills: SkillMetadata[]): SlashEntry[] {
  const skillEntries: SkillSlashCommand[] = skills
    .filter((s) => !s.alwaysActive)
    .map((s) => ({ kind: "skill" as const, name: s.name, description: s.description }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...LOCAL_COMMANDS, ...skillEntries];
}
