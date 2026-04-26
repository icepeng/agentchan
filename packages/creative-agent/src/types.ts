import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type {
  SessionEntry,
  SessionInfo,
} from "@mariozechner/pi-coding-agent";

export type { AgentMessage, Message, SessionEntry, SessionInfo };

export type SessionMode = "creative" | "meta";

export interface ProjectSessionInfo extends SessionInfo {
  mode?: SessionMode;
}

export interface ProjectSessionState {
  info: ProjectSessionInfo;
  entries: SessionEntry[];
  branch: SessionEntry[];
  leafId: string | null;
}
