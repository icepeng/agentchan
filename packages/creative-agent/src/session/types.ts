/**
 * Session storage types — single source of truth for the on-disk JSONL shape.
 *
 * Re-exports Pi types verbatim so creative-agent and the Web UI agree on
 * structure without redefining anything. Agentchan extension is the optional
 * `mode` field on the header.
 */

import type {
  SessionEntry,
  SessionEntryBase,
  SessionMessageEntry,
  SessionInfoEntry,
  CompactionEntry,
  CustomMessageEntry,
  ModelChangeEntry,
  SessionHeader,
  SessionInfo,
} from "@mariozechner/pi-coding-agent";

export type {
  SessionEntry,
  SessionEntryBase,
  SessionMessageEntry,
  SessionInfoEntry,
  CompactionEntry,
  CustomMessageEntry,
  ModelChangeEntry,
  SessionHeader,
  SessionInfo,
};

export type SessionMode = "creative" | "meta";

/** Pi `SessionHeader` plus Agentchan's `mode` extension. Pi's parser preserves unknown fields. */
export interface AgentchanSessionHeader extends SessionHeader {
  mode?: SessionMode;
}

/** SessionInfo augmented with Agentchan's `mode` and resolved title for list rendering. */
export interface AgentchanSessionInfo extends SessionInfo {
  mode: SessionMode;
  /** Title resolved from latest `session_info.name` or first user message. */
  title: string;
}
