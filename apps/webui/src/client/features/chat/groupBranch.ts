import type { Message } from "@mariozechner/pi-ai";
import type {
  CompactionEntry,
  CustomMessageEntry,
  SessionEntry,
  SessionMessageEntry,
} from "@/client/entities/session/index.js";
import { SKILL_LOAD_CUSTOM_TYPE } from "@/client/entities/session/index.js";

export type BubbleGroup =
  | { kind: "user"; entry: SessionMessageEntry }
  | { kind: "assistantTurn"; entries: SessionMessageEntry[] }
  | { kind: "skillLoad"; entry: CustomMessageEntry }
  | { kind: "compaction"; entry: CompactionEntry };

/**
 * Group a leaf-rooted branch of SessionEntry into renderable bubble groups.
 *
 * - Consecutive assistant + tool_result message entries collapse into one
 *   `assistantTurn` group (matches the streaming UX where every step lives
 *   inside one agent block).
 * - User message entries become their own `user` group.
 * - `custom_message` of customType `skill-load` becomes a `skillLoad` chip.
 * - `compaction` entries become a banner.
 * - `session_info` and other entry types are skipped (UI-irrelevant).
 */
export function groupBranch(branch: ReadonlyArray<SessionEntry>): BubbleGroup[] {
  const groups: BubbleGroup[] = [];
  for (const entry of branch) {
    if (entry.type === "compaction") {
      groups.push({ kind: "compaction", entry });
      continue;
    }
    if (entry.type === "custom_message") {
      const ce = entry;
      if (ce.customType === SKILL_LOAD_CUSTOM_TYPE) {
        groups.push({ kind: "skillLoad", entry: ce });
      }
      continue;
    }
    if (entry.type !== "message") continue;
    const msgEntry = entry;
    const role = (msgEntry.message as Message).role;
    if (role === "user") {
      groups.push({ kind: "user", entry: msgEntry });
      continue;
    }
    const prev = groups[groups.length - 1];
    if (prev && prev.kind === "assistantTurn") {
      prev.entries.push(msgEntry);
    } else {
      groups.push({ kind: "assistantTurn", entries: [msgEntry] });
    }
  }
  return groups;
}
