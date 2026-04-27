import type { Message, TextContent } from "@mariozechner/pi-ai";
import type {
  CompactionEntry,
  SessionEntry,
  SessionMessageEntry,
} from "@/client/entities/session/index.js";

/**
 * Wire-format markers used by `creative-agent`'s skill-injection text. We
 * keep a copy here because the client may only import types from
 * `@agentchan/creative-agent`. Consistency is enforced by the
 * `skill-load-consistency` test in the agent package.
 */
const SKILL_CONTENT_PREFIX = "<skill_content";
const SKILL_CONTENT_CLOSE = "</skill_content>";

export type BubbleGroup =
  | { kind: "user"; entry: SessionMessageEntry; displayText?: string }
  | { kind: "assistantTurn"; entries: SessionMessageEntry[] }
  | { kind: "skillLoad"; entry: SessionMessageEntry; skillText: string }
  | { kind: "compaction"; entry: CompactionEntry };

/**
 * Group a leaf-rooted branch of SessionEntry into renderable bubble groups.
 *
 * - Consecutive assistant + tool_result message entries collapse into one
 *   `assistantTurn` group.
 * - User message entries become their own `user` group. If the content
 *   starts with a `<skill_content>` block (slash skill activation), the
 *   block is split off into a leading `skillLoad` chip and the trailing
 *   command text becomes the user bubble.
 * - `compaction` entries become a banner.
 * - `session_info`, `custom_message`, and other entry types are skipped.
 */
export function groupBranch(branch: ReadonlyArray<SessionEntry>): BubbleGroup[] {
  const groups: BubbleGroup[] = [];
  for (const entry of branch) {
    if (entry.type === "compaction") {
      groups.push({ kind: "compaction", entry });
      continue;
    }
    if (entry.type !== "message") continue;
    const role = (entry.message as Message).role;
    if (role === "user") {
      const text = readUserText(entry);
      const split = splitSkillLoad(text);
      if (split) {
        groups.push({ kind: "skillLoad", entry, skillText: split.skillText });
        groups.push({ kind: "user", entry, displayText: split.userText });
      } else {
        groups.push({ kind: "user", entry });
      }
      continue;
    }
    const prev = groups[groups.length - 1];
    if (prev && prev.kind === "assistantTurn") {
      prev.entries.push(entry);
    } else {
      groups.push({ kind: "assistantTurn", entries: [entry] });
    }
  }
  return groups;
}

function readUserText(entry: SessionMessageEntry): string {
  const msg = entry.message as Message;
  if (msg.role !== "user") return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function splitSkillLoad(
  text: string,
): { skillText: string; userText: string } | null {
  if (!text.startsWith(SKILL_CONTENT_PREFIX)) return null;
  const lastClose = text.lastIndexOf(SKILL_CONTENT_CLOSE);
  if (lastClose < 0) return null;
  const splitAt = lastClose + SKILL_CONTENT_CLOSE.length;
  return {
    skillText: text.slice(0, splitAt),
    userText: text.slice(splitAt).trimStart(),
  };
}
