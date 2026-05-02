export type {
  BinaryFile,
  DataFile,
  ProjectFile,
  RendererActions,
  RendererAgentState as AgentState,
  RendererProps,
  RendererSnapshot,
  RendererTheme,
  TextFile,
} from "@agentchan/renderer/react";

export interface TextContent { type: "text"; text: string }
export interface ThinkingContent { type: "thinking"; thinking: string }
export interface ImageContent { type: "image"; data: string; mimeType: string }
export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export type ToolResultContent = (TextContent | ImageContent)[];

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  provider?: string;
  model?: string;
}
export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: ToolResultContent;
  isError: boolean;
}
export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

export type WindKey = "north" | "east" | "south";

export interface SalernStatus {
  hp: { current: number; max: number };
  mp: { current: number; max: number };
  emotion?: string;
  location?: string;
  conditions: string[];
}

export interface SalernStats {
  "힘": number;
  "민첩": number;
  "통찰": number;
  "화술": number;
}

export const STAT_KEYS = ["힘", "민첩", "통찰", "화술"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface InventoryItem {
  slug: string;
  name: string;
  qty?: number;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  status: "open" | "linked" | "resolved";
  title: string;
  clue?: string;
  links: string[];
  note?: string;
  wind?: WindKey;
}

export interface QuestEntry {
  id: string;
  status: "active" | "done";
  title: string;
  note?: string;
}

export interface RelationshipState {
  trust: number;
  stance?: string;
  note?: string;
  lastShift?: string;
}

export type WorldMode = "peace" | "combat";

export interface WorldState {
  mode: WorldMode;
  act: number;
}

export interface NameMapEntry {
  dir: string;
  avatarImage: string;
  color?: string;
}

export interface ChoiceOption {
  label: string;
  action: string;
  stat?: string;
  dc?: number;
}

export type SceneLineKind =
  | "user"
  | "narration"
  | "character"
  | "system"
  | "divider";

export interface SceneLine {
  kind: SceneLineKind;
  text: string;
  characterName?: string;
  charDir?: string;
  imageKey?: string;
  systemKind?: "judgment" | "event" | "item" | "relationship" | "generic";
  judgmentSuccess?: boolean;
}

export interface SceneGroup {
  kind: SceneLineKind;
  characterName?: string;
  charDir?: string;
  imageKey?: string;
  lines: SceneLine[];
}

export interface ParsedScene {
  groups: SceneGroup[];
  choices: ChoiceOption[];
  trailingDividerCount: number;
}

export interface WindBalance {
  north: number;
  east: number;
  south: number;
  dominant: WindKey;
}
