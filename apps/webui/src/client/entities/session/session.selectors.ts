import type { Message } from "@mariozechner/pi-ai";
import type {
  MessageEntry,
  ProjectSessionInfo,
  SessionEntry,
} from "./session.types.js";

export function isMessageEntry(entry: SessionEntry): entry is MessageEntry {
  return entry.type === "message" && (
    entry.message.role === "user"
    || entry.message.role === "assistant"
    || entry.message.role === "toolResult"
  );
}

export function entryMessage(entry: SessionEntry): Message | null {
  if (isMessageEntry(entry)) return entry.message;
  if (entry.type === "custom_message" && entry.display) {
    return {
      role: "user",
      content: entry.content,
      timestamp: Date.parse(entry.timestamp),
    };
  }
  return null;
}

export function branchToMessages(branch: ReadonlyArray<SessionEntry>): Message[] {
  return branch.flatMap((entry) => {
    const message = entryMessage(entry);
    return message ? [message] : [];
  });
}

export function sessionLabel(info: ProjectSessionInfo): string {
  return info.name || info.firstMessage || "New session";
}
