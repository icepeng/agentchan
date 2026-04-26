import type { MessageEntry, SessionEntry } from "@/client/entities/session/index.js";
import { isMessageEntry } from "@/client/entities/session/index.js";

export type BranchGroup =
  | { kind: "user"; entry: MessageEntry }
  | { kind: "assistantTurn"; entries: MessageEntry[] };

export function groupBranch(branch: readonly SessionEntry[]): BranchGroup[] {
  const groups: BranchGroup[] = [];

  for (const entry of branch) {
    if (!isMessageEntry(entry)) continue;
    const role = entry.message.role;
    if (role === "user") {
      groups.push({ kind: "user", entry });
      continue;
    }
    if (role !== "assistant" && role !== "toolResult") continue;

    const prev = groups[groups.length - 1];
    if (prev?.kind === "assistantTurn") {
      prev.entries.push(entry);
    } else {
      groups.push({ kind: "assistantTurn", entries: [entry] });
    }
  }

  return groups;
}
