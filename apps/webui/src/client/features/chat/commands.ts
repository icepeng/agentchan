import commandScore from "command-score";
import type { SkillMetadata, SkillEnvironment } from "@/client/entities/skill/index.js";
import type { TFunction, TranslationKey } from "@/client/i18n/index.js";

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

interface LocalSlashCommandDef {
  name: string;
  descriptionKey: TranslationKey;
  needsArg: boolean;
  argPlaceholder?: string;
}

export const LOCAL_COMMAND_DEFS: readonly LocalSlashCommandDef[] = [
  { name: "new", descriptionKey: "slash.new", needsArg: false },
  { name: "compact", descriptionKey: "slash.compact", needsArg: false },
  { name: "edit", descriptionKey: "slash.edit", needsArg: false },
  { name: "readme", descriptionKey: "slash.readme", needsArg: false },
  { name: "model", descriptionKey: "slash.model", needsArg: true, argPlaceholder: "<model-name>" },
  { name: "provider", descriptionKey: "slash.provider", needsArg: true, argPlaceholder: "<provider-name>" },
];

// All skills are invocable via slash command. disableModelInvocation skills
// are only reachable through the slash path.
export function buildSlashEntries(skills: SkillMetadata[], t: TFunction): SlashEntry[] {
  const local: LocalSlashCommand[] = LOCAL_COMMAND_DEFS.map((def) => ({
    kind: "local",
    name: def.name,
    description: t(def.descriptionKey),
    needsArg: def.needsArg,
    argPlaceholder: def.argPlaceholder,
  }));
  const skillEntries: SkillSlashCommand[] = skills
    .map((s) => ({ kind: "skill" as const, name: s.name, description: s.description, environment: s.environment }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...local, ...skillEntries];
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
