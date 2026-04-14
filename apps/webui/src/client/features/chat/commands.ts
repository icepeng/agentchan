import commandScore from "command-score";
import type { SkillMetadata, SkillEnvironment } from "@/client/entities/skill/index.js";

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
  environment?: SkillEnvironment;
}

export type SlashEntry = LocalSlashCommand | SkillSlashCommand;

export const LOCAL_COMMANDS: LocalSlashCommand[] = [
  { kind: "local", name: "new", description: "Create new session", needsArg: false },
  { kind: "local", name: "compact", description: "Summarize and continue in new session", needsArg: false },
  { kind: "local", name: "edit", description: "Toggle edit mode", needsArg: false },
  { kind: "local", name: "model", description: "Change model", needsArg: true, argPlaceholder: "<model-name>" },
  { kind: "local", name: "provider", description: "Change provider", needsArg: true, argPlaceholder: "<provider-name>" },
];

// All skills are invocable via slash command. disableModelInvocation skills
// are only reachable through the slash path.
export function buildSlashEntries(skills: SkillMetadata[]): SlashEntry[] {
  const skillEntries: SkillSlashCommand[] = skills
    .map((s) => ({ kind: "skill" as const, name: s.name, description: s.description, environment: s.environment }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...LOCAL_COMMANDS, ...skillEntries];
}

// command-score returns tiny non-zero scores for unrelated subsequences,
// so callers need a floor to drop noise matches.
export const MIN_SCORE = 0.01;

export function scoreEntry(entry: SlashEntry, query: string): number {
  if (query === "") return 1;
  const nameScore = commandScore(entry.name, query);
  const descScore = commandScore(entry.description, query);
  return Math.max(nameScore, descScore * 0.6);
}
