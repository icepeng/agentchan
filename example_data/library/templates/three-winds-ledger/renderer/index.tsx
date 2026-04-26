import { createRenderer, fileUrl, type BinaryFile, type DataFile, type ProjectFile, type RendererActions, type RendererAgentState, type RendererProps, type RendererSnapshot, type RendererTheme, type TextFile } from "@agentchan/renderer/react";
import "./index.css";
// ─────────────────────────────────────────────────────────────────────────────
//   three-winds-ledger renderer  ·  "Salren — Three Winds Ledger"
//
//   살레른 항구의 3막 서사 RPG. 평상(양피지) ↔ 전투(촛불·피) 이중 테마.
//   3분할 그리드: 좌(파티 카드) · 중앙(씬 본문) · 우(탭 — 인벤/퀘스트/관계/로그).
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ReactElement, ReactNode } from "react";

// ── Local renderer data shapes ──

type AgentState = RendererAgentState;

interface TextContent { type: "text"; text: string }
interface ThinkingContent { type: "thinking"; thinking: string }
interface ImageContent { type: "image"; data: string; mimeType: string }
interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

type ToolResultContent = (TextContent | ImageContent)[];

interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  provider?: string;
  model?: string;
}
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: ToolResultContent;
  isError: boolean;
}
type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;
type AssistantContentBlock = TextContent | ThinkingContent | ToolCall;

// ── Renderer theme contract (인라인 선언) ──


interface RendererContentProps {
  state: AgentState;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
}

// ── Palette (renderer internal) ───────────────

const ILLUMINATED_COPPER = "#b36b2a";
const VERDIGRIS = "#3d7a6d";
const VERMILION = "#a83225";
const MANUSCRIPT_VIOLET = "#6a45a0";
const MIST_BLUE = "#4a6b8a";

const COMBAT_BASE = "#1a110a";
const COMBAT_SURFACE = "#251810";
const COMBAT_CANDLE = "#d48a1f";
const COMBAT_BLOOD = "#a02420";
const COMBAT_PARCH = "#d8c9a8";
const COMBAT_FG2 = "#b8a38a";
const COMBAT_FG3 = "#8a7658";

const CHARACTER_COLORS = [
  VERDIGRIS,
  ILLUMINATED_COPPER,
  MANUSCRIPT_VIOLET,
  "#a83a70",
  "#4a7a3a",
  "#c84a28",
  MIST_BLUE,
  "#8a3a2d",
];

// ── Theme export ──────────────────────────────

const PEACE_THEME: RendererTheme = {
  base: {
    void: "#e8dcc0",
    base: "#eee3c8",
    surface: "#f6ecd2",
    elevated: "#fff8e4",
    accent: VERDIGRIS,
    fg: "#2d2015",
    fg2: "#5a4530",
    fg3: "#8a6e4d",
    edge: "#3d2a15",
  },
  prefersScheme: "light",
};

const COMBAT_THEME: RendererTheme = {
  base: {
    void: COMBAT_BASE,
    base: COMBAT_BASE,
    surface: COMBAT_SURFACE,
    elevated: "#2e1c14",
    accent: COMBAT_CANDLE,
    fg: COMBAT_PARCH,
    fg2: COMBAT_FG2,
    fg3: COMBAT_FG3,
    edge: "#3d2a1f",
  },
  prefersScheme: "dark",
};

interface ThemeCtx {
  files: ProjectFile[];
}

function resolveRendererTheme(ctx: ThemeCtx): RendererTheme {
  return detectCurrentMode(ctx.files) === "combat" ? COMBAT_THEME : PEACE_THEME;
}

function detectCurrentMode(files: ProjectFile[]): "peace" | "combat" {
  const file = files.find(
    (f): f is DataFile => f.type === "data" && f.path === "world-state.yaml",
  );
  if (!file) return "peace";
  const root = file.data && typeof file.data === "object" ? (file.data as Record<string, unknown>) : null;
  const mode = root && typeof root.mode === "string" ? root.mode : "peace";
  return mode === "combat" ? "combat" : "peace";
}

// ── Hidden file guard ─────────────────────────

const HIDDEN_PATHS = new Set<string>([
  "campaign.yaml",
  "companion-secrets.yaml",
]);

function isVisible(file: ProjectFile): boolean {
  if (HIDDEN_PATHS.has(file.path)) return false;
  if (file.path.endsWith("/intent.yaml")) return false;
  return true;
}

// ── Helpers ───────────────────────────────────

function resolveImageUrl(baseUrl: string, dir: string, imageKey: string): string {
  return `${baseUrl}/files/${dir}/${imageKey}`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function stampCode(content: string): string {
  const h = hashStr(content) % 10000;
  return h.toString().padStart(4, "0");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function firstChar(s: string): string {
  if (!s) return "?";
  const code = s.codePointAt(0);
  if (code === undefined) return "?";
  return String.fromCodePoint(code);
}

// ── Name map (avatar · color 공통 resolver) ──

interface NameMapEntry {
  slug: string;
  dir: string;
  displayName: string;
  avatarImage?: string;
  color?: string;
  role?: string;
}

function buildCharacterIndex(files: ProjectFile[]): Map<string, NameMapEntry> {
  const index = new Map<string, NameMapEntry>();
  for (const file of files) {
    if (file.type !== "text" || !file.frontmatter) continue;
    const fm = file.frontmatter;
    const name = fm.name ? String(fm.name) : undefined;
    const displayName = fm["display-name"]
      ? String(fm["display-name"])
      : (name ?? "");
    if (!name && !displayName) continue;

    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    const slug = name ?? displayName;
    const entry: NameMapEntry = {
      slug,
      dir,
      displayName,
      avatarImage: fm["avatar-image"] ? String(fm["avatar-image"]) : undefined,
      color: fm.color ? String(fm.color) : undefined,
      role: fm.role ? String(fm.role) : undefined,
    };

    index.set(slug, entry);
    if (displayName && !index.has(displayName)) index.set(displayName, entry);
    if (fm.names) {
      for (const raw of String(fm.names).split(",")) {
        const alias = raw.trim();
        if (alias && !index.has(alias)) index.set(alias, entry);
      }
    }
  }
  return index;
}

// ── DataFile extractors ───────────────────────

interface HpMp {
  current: number;
  max: number;
}

interface PartyData {
  pc: {
    name: string;
    hp: HpMp;
    mp: HpMp;
    conditions: string[];
  };
  companions: Record<
    string,
    {
      hp: HpMp;
      mp: HpMp;
      trust: number;
      approval: "rising" | "falling" | "steady";
      conditions: string[];
      in_party: boolean;
      quest_stage: string;
    }
  >;
}

interface StatsData {
  npcs: Record<string, number>;
}

interface InventoryItem {
  slug: string;
  name: string;
  qty?: number;
  tags?: string[];
  description?: string;
}

interface Equipment {
  slug?: string;
  name?: string;
  damage?: string;
  soak?: number;
  schools?: string[];
}

interface EvidenceEntry {
  slug: string;
  name: string;
  acquired_at_scene?: string;
  notes?: string;
  related_npcs?: string[];
}

interface InventoryData {
  gold: number;
  items: InventoryItem[];
  equipment: {
    weapon: Equipment | null;
    armor: Equipment | null;
    accessory: Equipment | null;
  };
  evidence: EvidenceEntry[];
}

interface QuestEntry {
  slug: string;
  title: string;
  status: string;
  act: number;
  giver?: string | null;
  description?: string;
  current_step?: string | null;
  steps_completed?: string[];
  completion_flag?: string;
  owner?: string;
}

interface QuestsData {
  quests: {
    main: QuestEntry[];
    companion: QuestEntry[];
    side: QuestEntry[];
  };
}

interface WorldStateData {
  act: number;
  current_scene: string;
  scene_count: number;
  time: string;
  day: number;
  weather: string;
  mode: "peace" | "combat";
  location: string;
  party_status: string;
  last_summary?: string;
}

function findDataFile(files: ProjectFile[], path: string): DataFile | null {
  return (
    files.find(
      (f): f is DataFile => f.type === "data" && f.path === path,
    ) ?? null
  );
}

function asRecord(x: unknown): Record<string, unknown> | null {
  if (x && typeof x === "object" && !Array.isArray(x)) {
    return x as Record<string, unknown>;
  }
  return null;
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function asNumber(x: unknown, fallback: number): number {
  return typeof x === "number" ? x : fallback;
}

function asString(x: unknown, fallback: string): string {
  return typeof x === "string" ? x : fallback;
}

function asHpMp(x: unknown): HpMp {
  const r = asRecord(x);
  if (!r) return { current: 0, max: 0 };
  return {
    current: asNumber(r.current, 0),
    max: asNumber(r.max, 0),
  };
}

function asStringArray(x: unknown): string[] {
  return asArray(x).map((v) => (typeof v === "string" ? v : String(v)));
}

function extractPartyData(files: ProjectFile[]): PartyData | null {
  const file = findDataFile(files, "party.yaml");
  if (!file) return null;
  const root = asRecord(file.data);
  if (!root) return null;

  const pcRaw = asRecord(root.pc) ?? {};
  const compRaw = asRecord(root.companions) ?? {};
  const companions: PartyData["companions"] = {};
  for (const [slug, val] of Object.entries(compRaw)) {
    const r = asRecord(val);
    if (!r) continue;
    companions[slug] = {
      hp: asHpMp(r.hp),
      mp: asHpMp(r.mp),
      trust: asNumber(r.trust, 0),
      approval: ((): "rising" | "falling" | "steady" => {
        const a = asString(r.approval, "steady");
        return a === "rising" || a === "falling" ? a : "steady";
      })(),
      conditions: asStringArray(r.conditions),
      in_party: r.in_party !== false,
      quest_stage: asString(r.quest_stage, "pending"),
    };
  }
  return {
    pc: {
      name: asString(pcRaw.name, "여행자"),
      hp: asHpMp(pcRaw.hp),
      mp: asHpMp(pcRaw.mp),
      conditions: asStringArray(pcRaw.conditions),
    },
    companions,
  };
}

function extractStatsData(files: ProjectFile[]): StatsData {
  const file = findDataFile(files, "stats.yaml");
  const root = file ? asRecord(file.data) : null;
  const npcsRaw = root ? asRecord(root.npcs) : null;
  const npcs: Record<string, number> = {};
  if (npcsRaw) {
    for (const [slug, val] of Object.entries(npcsRaw)) {
      if (typeof val === "number") npcs[slug] = val;
    }
  }
  return { npcs };
}

function extractInventoryData(files: ProjectFile[]): InventoryData {
  const file = findDataFile(files, "inventory.yaml");
  const root = file ? asRecord(file.data) : null;
  if (!root) {
    return {
      gold: 0,
      items: [],
      equipment: { weapon: null, armor: null, accessory: null },
      evidence: [],
    };
  }
  const items: InventoryItem[] = asArray(root.items)
    .map((v) => asRecord(v))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => ({
      slug: asString(r.slug, ""),
      name: asString(r.name, ""),
      qty: typeof r.qty === "number" ? r.qty : undefined,
      tags: asStringArray(r.tags),
      description: r.description ? asString(r.description, "") : undefined,
    }))
    .filter((i) => i.slug);

  const eqRaw = asRecord(root.equipment) ?? {};
  const asEquipment = (x: unknown): Equipment | null => {
    const r = asRecord(x);
    if (!r) return null;
    return {
      slug: r.slug ? asString(r.slug, "") : undefined,
      name: r.name ? asString(r.name, "") : undefined,
      damage: r.damage ? asString(r.damage, "") : undefined,
      soak: typeof r.soak === "number" ? r.soak : undefined,
      schools: asStringArray(r.schools),
    };
  };

  const evidence: EvidenceEntry[] = asArray(root.evidence)
    .map((v) => asRecord(v))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => ({
      slug: asString(r.slug, ""),
      name: asString(r.name, ""),
      acquired_at_scene: r.acquired_at_scene
        ? asString(r.acquired_at_scene, "")
        : undefined,
      notes: r.notes ? asString(r.notes, "") : undefined,
      related_npcs: asStringArray(r.related_npcs),
    }))
    .filter((e) => e.slug);

  return {
    gold: asNumber(root.gold, 0),
    items,
    equipment: {
      weapon: asEquipment(eqRaw.weapon),
      armor: asEquipment(eqRaw.armor),
      accessory: asEquipment(eqRaw.accessory),
    },
    evidence,
  };
}

function extractQuestsData(files: ProjectFile[]): QuestsData {
  const file = findDataFile(files, "quests.yaml");
  const root = file ? asRecord(file.data) : null;
  const questsRaw = root ? asRecord(root.quests) : null;
  const parseList = (x: unknown): QuestEntry[] => {
    return asArray(x)
      .map((v) => asRecord(v))
      .filter((r): r is Record<string, unknown> => r !== null)
      .map((r) => ({
        slug: asString(r.slug, ""),
        title: asString(r.title, ""),
        status: asString(r.status, "dormant"),
        act: asNumber(r.act, 1),
        giver: r.giver ? asString(r.giver, "") : null,
        description: r.description ? asString(r.description, "") : undefined,
        current_step:
          r.current_step !== null && r.current_step !== undefined
            ? asString(r.current_step, "")
            : null,
        steps_completed: asStringArray(r.steps_completed),
        completion_flag: r.completion_flag
          ? asString(r.completion_flag, "")
          : undefined,
        owner: r.owner ? asString(r.owner, "") : undefined,
      }))
      .filter((q) => q.slug);
  };
  return {
    quests: {
      main: parseList(questsRaw?.main),
      companion: parseList(questsRaw?.companion),
      side: parseList(questsRaw?.side),
    },
  };
}

function extractWorldState(files: ProjectFile[]): WorldStateData | null {
  const file = findDataFile(files, "world-state.yaml");
  if (!file) return null;
  const root = asRecord(file.data);
  if (!root) return null;
  return {
    act: asNumber(root.act, 1),
    current_scene: asString(root.current_scene, ""),
    scene_count: asNumber(root.scene_count, 0),
    time: asString(root.time, "10:00"),
    day: asNumber(root.day, 1),
    weather: asString(root.weather, ""),
    mode: asString(root.mode, "peace") === "combat" ? "combat" : "peace",
    location: asString(root.location, ""),
    party_status: asString(root.party_status, "ready"),
    last_summary: root.last_summary
      ? asString(root.last_summary, "")
      : undefined,
  };
}

function buildLocationTitles(files: ProjectFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of files) {
    if (f.type !== "text") continue;
    if (!f.path.startsWith("locations/")) continue;
    const slug = f.path.replace(/^locations\//, "").replace(/\.md$/, "");
    const fm = f.frontmatter;
    const title = fm?.title
      ? String(fm.title)
      : fm?.name
        ? String(fm.name)
        : slug;
    map.set(slug, title);
  }
  return map;
}

// ── PC frontmatter extractor ──────────────────

interface PcData {
  name: string;
  displayName: string;
  preset: string | null;
  attributes: {
    strength: number;
    agility: number;
    insight: number;
    charisma: number;
  };
  hp: HpMp;
  mp: HpMp;
  spells: string[];
}

function extractPcData(files: ProjectFile[]): PcData | null {
  const file = files.find(
    (f): f is TextFile => f.type === "text" && f.path === "pc.md",
  );
  if (!file || !file.frontmatter) return null;
  const fm = file.frontmatter;
  const attr = asRecord(fm.attributes) ?? {};
  return {
    name: asString(fm.name, "여행자"),
    displayName: asString(fm.display_name ?? fm["display-name"], "여행자"),
    preset: fm.preset ? asString(fm.preset, "") : null,
    attributes: {
      strength: asNumber(attr.strength, 0),
      agility: asNumber(attr.agility, 0),
      insight: asNumber(attr.insight, 0),
      charisma: asNumber(attr.charisma, 0),
    },
    hp: asHpMp(fm.hp),
    mp: asHpMp(fm.mp),
    spells: asStringArray(fm.spells),
  };
}

// ── Scene parsing ─────────────────────────────

type SceneEvent =
  | { kind: "user"; text: string }
  | { kind: "char"; slug: string; text: string }
  | { kind: "narration"; text: string }
  | { kind: "image"; slug: string; key: string }
  | { kind: "divider" }
  | { kind: "system"; text: string }
  | {
      kind: "stat";
      npc: string;
      delta: number;
      trigger: string;
      direction: "rising" | "falling" | "steady";
    }
  | { kind: "item"; slug: string; change: string; text?: string }
  | {
      kind: "quest";
      slug: string;
      event: "step" | "complete" | "fail";
      step?: string;
    }
  | { kind: "combat"; round: number; inner: SceneEvent[] };

interface ChoiceOption {
  label: string;
  action: string;
  stat: string;
  dc: number;
}

interface ParseResult {
  events: SceneEvent[];
}

const CHAR_LINE_RE = /^\[CHAR:([a-z0-9][a-z0-9_-]*)\]\s*(.*)$/i;
const BOLD_SPEAKER_RE = /^\*\*([^*\n]+?)\*\*\s*:?\s*(.+)$/;
const IMAGE_TOKEN_RE = /^\[([a-z0-9][a-z0-9_-]*):(assets\/[^\]]+)\]$/i;
const INLINE_IMAGE_RE = /\[([a-z0-9][a-z0-9_-]*):(assets\/[^\]]+)\]/gi;
const STAT_LINE_RE =
  /^\[STAT\]\s+([a-z0-9][a-z0-9_-]*)\s+([+-]?\d+)\s+\(([^)]+)\)(?:\s+(rising|falling|steady))?/i;
const ITEM_LINE_RE =
  /^\[item:([a-z0-9][a-z0-9_-]*)\s+([^\]]+)\]\s*(?:"([^"]*)")?/i;
const QUEST_STEP_RE = /^\[quest:([a-z0-9][a-z0-9_-]*)\s+step="([^"]+)"\]/i;
const QUEST_COMPLETE_RE = /^\[quest:([a-z0-9][a-z0-9_-]*)\s+(complete|fail)\]/i;
const BEAT_COMBAT_OPEN_RE = /^<beat\s+type="combat"(?:\s+round="(\d+)")?>$/i;
const USER_LINE_RE = /^>\s+(.+)$/;

function extractNextChoices(files: ProjectFile[]): ChoiceOption[] {
  const file = findDataFile(files, "next-choices.yaml");
  if (!file) return [];
  const root = asRecord(file.data);
  if (!root) return [];
  const raw = asArray(root.options);
  const out: ChoiceOption[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const label = asString(r.label, "").trim();
    const action = asString(r.action, "").trim();
    if (!label || !action) continue;
    out.push({
      label,
      action,
      stat: asString(r.stat, ""),
      dc: asNumber(r.dc, 0),
    });
  }
  return out;
}

function parseStatLine(line: string): SceneEvent | null {
  const m = line.match(STAT_LINE_RE);
  if (!m) return null;
  const [, npc, deltaStr, trigger, dir] = m;
  const direction = dir === "rising" || dir === "falling" ? dir : "steady";
  return {
    kind: "stat",
    npc,
    delta: parseInt(deltaStr, 10),
    trigger,
    direction,
  };
}

function parseItemLine(line: string): SceneEvent | null {
  const m = line.match(ITEM_LINE_RE);
  if (!m) return null;
  const [, slug, change, text] = m;
  return { kind: "item", slug, change: change.trim(), text };
}

function parseQuestLine(line: string): SceneEvent | null {
  let m = line.match(QUEST_STEP_RE);
  if (m) return { kind: "quest", slug: m[1], event: "step", step: m[2] };
  m = line.match(QUEST_COMPLETE_RE);
  if (m) {
    const evt = m[2].toLowerCase() === "complete" ? "complete" : "fail";
    return { kind: "quest", slug: m[1], event: evt };
  }
  return null;
}

function parseInlineLine(
  line: string,
  charIndex?: Map<string, NameMapEntry>,
): SceneEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { kind: "divider" };

  const userMatch = trimmed.match(USER_LINE_RE);
  if (userMatch) return { kind: "user", text: userMatch[1] };

  const charMatch = trimmed.match(CHAR_LINE_RE);
  if (charMatch)
    return { kind: "char", slug: charMatch[1], text: charMatch[2] };

  if (charIndex) {
    const boldMatch = trimmed.match(BOLD_SPEAKER_RE);
    if (boldMatch) {
      const name = boldMatch[1].trim().replace(/:$/, "");
      const entry = charIndex.get(name);
      if (entry)
        return { kind: "char", slug: entry.slug, text: boldMatch[2].trim() };
    }
  }

  const imgMatch = trimmed.match(IMAGE_TOKEN_RE);
  if (imgMatch) return { kind: "image", slug: imgMatch[1], key: imgMatch[2] };

  const stat = parseStatLine(trimmed);
  if (stat) return stat;

  const item = parseItemLine(trimmed);
  if (item) return item;

  const quest = parseQuestLine(trimmed);
  if (quest) return quest;

  return { kind: "narration", text: trimmed };
}

type BlockState =
  | { kind: "none" }
  | { kind: "system"; lines: string[] }
  | { kind: "combat"; round: number; lines: string[] };

function parseSceneContent(
  raw: string,
  charIndex?: Map<string, NameMapEntry>,
): ParseResult {
  return parseSceneLines(raw.split("\n"), charIndex);
}

function parseSceneLines(
  inputLines: string[],
  charIndex?: Map<string, NameMapEntry>,
): ParseResult {
  const events: SceneEvent[] = [];
  let state: BlockState = { kind: "none" };

  const flushCombat = (round: number, lines: string[]) => {
    const inner = parseSceneLines(lines, charIndex).events;
    events.push({ kind: "combat", round, inner });
  };

  for (const rawLine of inputLines) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();

    if (state.kind === "system") {
      if (/^<\/roll>$/i.test(trimmed)) {
        events.push({ kind: "system", text: state.lines.join("\n").trim() });
        state = { kind: "none" };
        continue;
      }
      state.lines.push(line);
      continue;
    }
    if (state.kind === "combat") {
      if (/^<\/beat>$/i.test(trimmed)) {
        flushCombat(state.round, state.lines);
        state = { kind: "none" };
        continue;
      }
      state.lines.push(line);
      continue;
    }

    if (/^<roll>$/i.test(trimmed)) {
      state = { kind: "system", lines: [] };
      continue;
    }
    const combatOpen = trimmed.match(BEAT_COMBAT_OPEN_RE);
    if (combatOpen) {
      const round = combatOpen[1] ? parseInt(combatOpen[1], 10) : 0;
      state = { kind: "combat", round, lines: [] };
      continue;
    }

    const inlineRoll = trimmed.match(/^<roll>(.+?)<\/roll>$/i);
    if (inlineRoll) {
      events.push({ kind: "system", text: inlineRoll[1].trim() });
      continue;
    }

    const evt = parseInlineLine(line, charIndex);
    if (evt) events.push(evt);
  }

  return { events };
}

// ── Inline text formatting ────────────────────
//
// *말·행동*, **강조**, "자연어 쿼트", [slug:assets/key] 를 ReactNode[] 로 변환.
// React는 텍스트를 자동 escape하므로 escape 헬퍼 불필요.

interface InlineCtx {
  baseUrl: string;
  charIndex: Map<string, NameMapEntry>;
}

// 한 줄 내 **bold** · *italic* · "smart quote" 처리.
// 인라인 이미지 토큰은 이미 바깥에서 split 되어 이 함수로 오지 않는다고 가정.
function renderInlineSegment(text: string, key: string): ReactNode {
  // smart quote 치환
  const quoted = text.replace(/"([^"]+?)"/g, "“$1”");
  // **bold** · *italic* 분할 (둘 다 동일 탐색)
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(quoted)) !== null) {
    if (match.index > cursor) parts.push(quoted.slice(cursor, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`b-${idx++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(
        <em key={`i-${idx++}`} className="rpg-action">
          {match[2]}
        </em>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < quoted.length) parts.push(quoted.slice(cursor));
  return <span key={key}>{parts}</span>;
}

function formatInline(text: string, ctx: InlineCtx): ReactNode[] {
  // 먼저 inline image 토큰으로 분할 → 각 조각은 텍스트 or polaroid
  const out: ReactNode[] = [];
  let cursor = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_IMAGE_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) {
      out.push(
        renderInlineSegment(text.slice(cursor, m.index), `seg-${idx++}`),
      );
    }
    out.push(
      <InlinePolaroid
        key={`img-${idx++}`}
        slug={m[1]}
        imageKey={m[2]}
        ctx={ctx}
      />,
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push(renderInlineSegment(text.slice(cursor), `seg-${idx++}`));
  }
  return out;
}

function InlinePolaroid(props: {
  slug: string;
  imageKey: string;
  ctx: InlineCtx;
}): ReactElement {
  const { slug, imageKey, ctx } = props;
  const entry = ctx.charIndex.get(slug);
  const dir = entry?.dir ?? `characters/${slug}`;
  const name = entry?.displayName ?? slug;
  const url = resolveImageUrl(ctx.baseUrl, dir, imageKey);
  const tilt = (hashStr(slug + imageKey) % 5) - 2;
  const tag = `${name} · ${imageKey.replace(/^assets\//, "")}`;
  return (
    <figure className="rpg-polaroid" data-tilt={String(tilt)}>
      <div className="rpg-polaroid-frame">
        <img
          className="rpg-polaroid-img"
          src={url}
          alt={tag}
          onError={(e) => {
            const fig = (e.currentTarget as HTMLImageElement).closest(
              ".rpg-polaroid",
            ) as HTMLElement | null;
            if (fig) fig.style.display = "none";
          }}
        />
        <div className="rpg-polaroid-gloss" />
      </div>
      <figcaption className="rpg-polaroid-tag">{tag}</figcaption>
    </figure>
  );
}

// ── Character color/portrait resolver ─────────

function fallbackColor(key: string, map: Map<string, string>): string {
  const existing = map.get(key);
  if (existing) return existing;
  const c = CHARACTER_COLORS[map.size % CHARACTER_COLORS.length];
  map.set(key, c);
  return c;
}

interface PortraitViewProps {
  slug: string;
  charIndex: Map<string, NameMapEntry>;
  fallback: Map<string, string>;
  baseUrl: string;
  imageKey?: string;
}

interface ResolvedPortrait {
  displayName: string;
  color: string;
  element: ReactElement;
}

function resolvePortrait(opts: PortraitViewProps): ResolvedPortrait {
  const { slug, charIndex, fallback, baseUrl, imageKey } = opts;
  const entry = charIndex.get(slug);
  const displayName = entry?.displayName ?? slug;
  const color = entry?.color || fallbackColor(slug, fallback);
  const key = imageKey ?? entry?.avatarImage;
  const initial = firstChar(displayName);

  if (entry && key) {
    const src = resolveImageUrl(baseUrl, entry.dir, key);
    return {
      displayName,
      color,
      element: (
        <div className="rpg-portrait">
          <div className="rpg-portrait-halo" />
          <img
            className="rpg-portrait-img"
            src={src}
            alt={displayName}
            onError={(e) => {
              const parent = (e.currentTarget as HTMLImageElement)
                .parentElement as HTMLElement | null;
              if (parent) parent.dataset.fallback = "1";
            }}
          />
          <div className="rpg-portrait-fallback" aria-hidden="true">
            {initial}
          </div>
        </div>
      ),
    };
  }
  return {
    displayName,
    color,
    element: (
      <div className="rpg-portrait" data-fallback="1">
        <div className="rpg-portrait-halo" />
        <div className="rpg-portrait-fallback" aria-hidden="true">
          {initial}
        </div>
      </div>
    ),
  };
}

// ── Event renderers ───────────────────────────

interface EventCtx {
  baseUrl: string;
  charIndex: Map<string, NameMapEntry>;
  fallback: Map<string, string>;
  actions: RendererActions;
}

function UserEchoView(props: { text: string; id: string }): ReactElement {
  return (
    <aside id={props.id} className="rpg-whisper">
      <span className="rpg-whisper-mark" aria-hidden="true">
        {">"}
      </span>
      <span className="rpg-whisper-body">{props.text}</span>
    </aside>
  );
}

function CharEventView(props: {
  slug: string;
  text: string;
  ctx: EventCtx;
  id: string;
}): ReactElement {
  const { slug, text, ctx, id } = props;
  const info = resolvePortrait({
    slug,
    charIndex: ctx.charIndex,
    fallback: ctx.fallback,
    baseUrl: ctx.baseUrl,
  });
  const body = formatInline(text, {
    baseUrl: ctx.baseUrl,
    charIndex: ctx.charIndex,
  });
  const style = { ["--c" as string]: info.color } as CSSProperties;
  return (
    <section id={id} className="rpg-dialogue" style={style}>
      <div className="rpg-dialogue-portrait">{info.element}</div>
      <div className="rpg-dialogue-caption">
        <header className="rpg-nameplate">
          <span className="rpg-nameplate-mark" />
          <span className="rpg-nameplate-name">{info.displayName}</span>
        </header>
        <div className="rpg-dialogue-body">{body}</div>
      </div>
    </section>
  );
}

function NarrationEventView(props: {
  text: string;
  ctx: EventCtx;
  id: string;
  isLead: boolean;
}): ReactElement {
  const { text, ctx, id, isLead } = props;
  const stripped = text.replace(/^\*(.+)\*$/s, "$1");
  const wasFullItalic = stripped !== text;
  const inner = formatInline(stripped, {
    baseUrl: ctx.baseUrl,
    charIndex: ctx.charIndex,
  });
  const classes = ["rpg-narration"];
  if (wasFullItalic) classes.push("rpg-narration--stage");
  if (isLead) classes.push("rpg-narration--lead");
  return (
    <div id={id} className={classes.join(" ")}>
      <span className="rpg-narration-rule" />
      <span className="rpg-narration-text">{inner}</span>
      <span className="rpg-narration-rule" />
    </div>
  );
}

function ImageEventView(props: {
  slug: string;
  imageKey: string;
  ctx: EventCtx;
  id: string;
}): ReactElement {
  const { slug, imageKey, ctx, id } = props;
  return (
    <div id={id} className="rpg-polaroid-solo">
      <InlinePolaroid
        slug={slug}
        imageKey={imageKey}
        ctx={{ baseUrl: ctx.baseUrl, charIndex: ctx.charIndex }}
      />
    </div>
  );
}

function DividerEventView(props: { id: string }): ReactElement {
  return (
    <div id={props.id} className="rpg-divider" role="separator">
      <span className="rpg-divider-rule" />
      <span className="rpg-divider-flourish" aria-hidden="true">
        {"❦"}
      </span>
      <svg className="rpg-rose" viewBox="0 0 40 40" aria-hidden="true">
        <g className="rpg-rose-spin">
          <circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.25" />
          <circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.18" />
        </g>
        <g fill="currentColor">
          <path d="M20 6 Q22 11 20 16 Q18 11 20 6 Z" opacity="0.95" />
          <path d="M20 14 Q14 12 12 18 Q14 22 20 18 Z" opacity="0.78" />
          <path d="M20 14 Q26 12 28 18 Q26 22 20 18 Z" opacity="0.78" />
          <path d="M14 20 Q20 22 26 20 L24 24 L16 24 Z" opacity="0.85" />
          <rect x="13" y="24" width="14" height="1.4" rx="0.4" opacity="0.7" />
          <path d="M20 26 Q19 30 16 33 M20 26 Q21 30 24 33" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.6" />
          <circle cx="20" cy="27" r="0.9" opacity="0.85" />
        </g>
      </svg>
      <span className="rpg-divider-flourish" aria-hidden="true">
        {"❦"}
      </span>
      <span className="rpg-divider-rule" />
    </div>
  );
}

function statLabel(stat: string): string {
  switch (stat) {
    case "strength":
      return "힘";
    case "agility":
      return "민첩";
    case "insight":
      return "통찰";
    case "charisma":
      return "화술";
    default:
      return stat;
  }
}

function NextChoicesView(props: {
  options: ChoiceOption[];
  actions: RendererActions;
}): ReactElement | null {
  const { options, actions } = props;
  if (options.length === 0) return null;
  return (
    <div className="rpg-check" role="group" aria-label="이 턴의 선택지">
      <div className="rpg-check-head">
        <svg className="rpg-check-ico" viewBox="0 0 14 14" aria-hidden="true">
          <polygon points="7,1 9,5 13,6 10,9 11,13 7,11 3,13 4,9 1,6 5,5" fill="none" stroke="currentColor" strokeWidth="0.9" />
        </svg>
        <span className="rpg-check-title">이 턴의 선택지</span>
        <span className="rpg-check-hint">
          버튼을 누르면 입력창에 채워집니다. 자유 입력도 가능합니다.
        </span>
      </div>
      <div className="rpg-check-list">
        {options.map((opt, i) => {
          const style = { ["--i" as string]: String(i) } as CSSProperties;
          return (
            <button
              key={i}
              type="button"
              className="rpg-check-option"
              style={style}
              onClick={() => actions.fill(opt.action)}
            >
              <span className="rpg-check-label">{opt.label}</span>
              <span className="rpg-check-meta">
                {opt.stat ? (
                  <span className="rpg-check-stat">{statLabel(opt.stat)}</span>
                ) : null}
                {opt.dc > 0 ? (
                  <span className="rpg-check-dc">DC&nbsp;{opt.dc}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function parseSystemRoll(text: string): {
  stat?: string;
  formula?: string;
  total?: number;
  dc?: number;
  outcome?: "SUCCESS" | "FAIL";
} {
  const m = text.match(
    /roll:\s*(\w+)\s+([\d+\-d\s힘민첩통찰화술]+?)\s*=\s*(\d+)\s+vs\s+DC\s+(\d+)\s*[→:\-]*\s*(SUCCESS|FAIL)/i,
  );
  if (!m) return {};
  return {
    stat: m[1],
    formula: m[2].trim(),
    total: parseInt(m[3], 10),
    dc: parseInt(m[4], 10),
    outcome: m[5].toUpperCase() as "SUCCESS" | "FAIL",
  };
}

function SystemEventView(props: { text: string; id: string }): ReactElement {
  const { text, id } = props;
  const parsed = parseSystemRoll(text);
  if (parsed.outcome) {
    const glyph = parsed.outcome === "SUCCESS" ? "✓" : "✗";
    const cls =
      parsed.outcome === "SUCCESS" ? "rpg-system--ok" : "rpg-system--fail";
    return (
      <div id={id} className={`rpg-system ${cls}`}>
        <span className="rpg-system-glyph" aria-hidden="true">
          {glyph}
        </span>
        <span className="rpg-system-stat">{statLabel(parsed.stat ?? "")}</span>
        <span className="rpg-system-formula">{parsed.formula ?? ""}</span>
        <span className="rpg-system-eq">=</span>
        <span className="rpg-system-total">{parsed.total}</span>
        <span className="rpg-system-sep">vs</span>
        <span className="rpg-system-dc">DC {parsed.dc}</span>
        <span className="rpg-system-arrow" aria-hidden="true">
          {"→"}
        </span>
        <span className="rpg-system-outcome">{parsed.outcome}</span>
      </div>
    );
  }
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div id={id} className="rpg-system">
      <span className="rpg-system-glyph" aria-hidden="true">
        {"✦"}
      </span>
      <div className="rpg-system-body">
        {lines.map((l, i) => (
          <div key={i} className="rpg-system-line">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatEventView(props: {
  event: Extract<SceneEvent, { kind: "stat" }>;
  id: string;
  charIndex: Map<string, NameMapEntry>;
}): ReactElement {
  const { event, id, charIndex } = props;
  const entry = charIndex.get(event.npc);
  const name = entry?.displayName ?? event.npc;
  const sign = event.delta > 0 ? "+" : "";
  const dirGlyph =
    event.direction === "rising"
      ? "↗"
      : event.direction === "falling"
        ? "↘"
        : "→";
  const cls =
    event.delta > 0
      ? "rpg-stat rpg-stat--up"
      : event.delta < 0
        ? "rpg-stat rpg-stat--down"
        : "rpg-stat";
  return (
    <div id={id} className={cls}>
      <span className="rpg-stat-name">{name}</span>
      <span className="rpg-stat-delta">
        {sign}
        {event.delta}
      </span>
      <span className="rpg-stat-trigger">{event.trigger}</span>
      <span className="rpg-stat-arrow" aria-hidden="true">
        {dirGlyph}
      </span>
    </div>
  );
}

function ItemEventView(props: {
  event: Extract<SceneEvent, { kind: "item" }>;
  id: string;
}): ReactElement {
  const { event, id } = props;
  const changeMatch = event.change.match(/^([+-]?\d+)$/);
  const isEquipped = /equipped/i.test(event.change);
  const glyph = isEquipped
    ? "⦿"
    : changeMatch && parseInt(changeMatch[1], 10) > 0
      ? "⊕"
      : changeMatch && parseInt(changeMatch[1], 10) < 0
        ? "⊖"
        : "·";
  const cls =
    changeMatch && parseInt(changeMatch[1], 10) < 0
      ? "rpg-ledger rpg-ledger--spent"
      : "rpg-ledger rpg-ledger--gain";
  return (
    <div id={id} className={cls}>
      <span className="rpg-ledger-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="rpg-ledger-kind">item</span>
      <span className="rpg-ledger-name">{event.slug}</span>
      <span className="rpg-ledger-change">{event.change}</span>
      {event.text ? (
        <span className="rpg-ledger-desc">{event.text}</span>
      ) : null}
    </div>
  );
}

function QuestEventView(props: {
  event: Extract<SceneEvent, { kind: "quest" }>;
  id: string;
}): ReactElement {
  const { event, id } = props;
  const glyph =
    event.event === "complete"
      ? "✦"
      : event.event === "fail"
        ? "✗"
        : "∽";
  const cls =
    event.event === "complete"
      ? "rpg-ledger rpg-ledger--quest-done"
      : event.event === "fail"
        ? "rpg-ledger rpg-ledger--quest-fail"
        : "rpg-ledger rpg-ledger--quest";
  return (
    <div id={id} className={cls}>
      <span className="rpg-ledger-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="rpg-ledger-kind">quest</span>
      <span className="rpg-ledger-name">{event.slug}</span>
      <span className="rpg-ledger-desc">
        {event.step
          ? event.step
          : event.event === "complete"
            ? "완료"
            : "실패"}
      </span>
    </div>
  );
}

function EventView(props: {
  event: SceneEvent;
  id: string;
  ctx: EventCtx;
  isLead?: boolean;
}): ReactElement {
  const { event, id, ctx, isLead } = props;
  switch (event.kind) {
    case "user":
      return <UserEchoView text={event.text} id={id} />;
    case "char":
      return <CharEventView slug={event.slug} text={event.text} ctx={ctx} id={id} />;
    case "narration":
      return (
        <NarrationEventView
          text={event.text}
          ctx={ctx}
          id={id}
          isLead={isLead ?? false}
        />
      );
    case "image":
      return (
        <ImageEventView slug={event.slug} imageKey={event.key} ctx={ctx} id={id} />
      );
    case "system":
      return <SystemEventView text={event.text} id={id} />;
    case "stat":
      return <StatEventView event={event} id={id} charIndex={ctx.charIndex} />;
    case "item":
      return <ItemEventView event={event} id={id} />;
    case "quest":
      return <QuestEventView event={event} id={id} />;
    case "divider":
      return <DividerEventView id={id} />;
    case "combat":
      return <CombatBeatView event={event} ctx={ctx} id={id} />;
  }
}

function CombatBeatView(props: {
  event: Extract<SceneEvent, { kind: "combat" }>;
  ctx: EventCtx;
  id: string;
}): ReactElement {
  const { event, ctx, id } = props;
  return (
    <section id={id} className="rpg-round">
      <header className="rpg-round-head">
        <span className="rpg-round-label">ROUND</span>
        <span className="rpg-round-number">
          {event.round.toString().padStart(2, "0")}
        </span>
        <span className="rpg-round-rule" />
        <span className="rpg-round-flicker" aria-hidden="true">
          <svg viewBox="0 0 12 20" className="rpg-candle">
            <path d="M6 2 Q7.2 3 6 5 Q4.8 7 6 9" stroke="currentColor" strokeWidth="0.8" fill="none" className="rpg-candle-flame" />
            <rect x="4.2" y="9" width="3.6" height="9" rx="0.6" fill="currentColor" opacity="0.7" />
          </svg>
        </span>
      </header>
      <div className="rpg-round-body">
        {event.inner.map((e, i) => (
          <EventView key={i} event={e} id={`${id}-i${i}`} ctx={ctx} />
        ))}
      </div>
    </section>
  );
}

function EventsView(props: {
  events: SceneEvent[];
  ctx: EventCtx;
}): ReactElement {
  const { events, ctx } = props;
  const nodes: ReactElement[] = [];
  let leadAvailable = true;
  events.forEach((e, i) => {
    let isLead = false;
    if (e.kind === "narration" && leadAvailable) {
      isLead = true;
      leadAvailable = false;
    } else if (e.kind === "divider") {
      leadAvailable = true;
    }
    nodes.push(
      <EventView
        key={`e-${i}`}
        event={e}
        id={`rpg-e-${i}`}
        ctx={ctx}
        isLead={isLead}
      />,
    );
  });
  return <>{nodes}</>;
}

// ── HUD (top strip) ───────────────────────────

function actRoman(act: number): string {
  switch (act) {
    case 1:
      return "Ⅰ";
    case 2:
      return "Ⅱ";
    case 3:
      return "Ⅲ";
    default:
      return String(act);
  }
}

function HudView(props: {
  world: WorldStateData | null;
  locTitles: Map<string, string>;
}): ReactElement {
  const { world, locTitles } = props;
  const act = world?.act ?? 1;
  const time = world?.time ?? "--:--";
  const day = world?.day ?? 1;
  const locSlug = world?.location ?? "";
  const locTitle = locSlug ? (locTitles.get(locSlug) ?? locSlug) : "---";
  const weather = world?.weather ?? "";
  const mode = world?.mode ?? "peace";

  const modeGlyph = mode === "combat" ? "⚔" : "☮";
  const modeLabel = mode === "combat" ? "전투" : "평화";

  return (
    <header className="rpg-hud">
      <div className="rpg-hud-brand">
        <svg className="rpg-lantern" viewBox="0 0 16 22" aria-hidden="true">
          <ellipse cx="8" cy="10" rx="5" ry="6" className="rpg-lantern-glow" />
          <rect x="3.5" y="4" width="9" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="0.6" />
          <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="0.6" />
          <rect x="5.5" y="16" width="5" height="2" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </svg>
        <div className="rpg-hud-title-col">
          <h1 className="rpg-hud-title-ribbon">
            <span className="rpg-ribbon-tip rpg-ribbon-tip--left" aria-hidden="true" />
            <span className="rpg-hud-title">Three Winds Ledger</span>
            <span className="rpg-ribbon-tip rpg-ribbon-tip--right" aria-hidden="true" />
          </h1>
          <span className="rpg-hud-sub">살레른 항구 · Salren Harbour</span>
        </div>
      </div>
      <div className="rpg-hud-meta">
        <div className="rpg-hud-cell">
          <span className="rpg-hud-label">막</span>
          <span className="rpg-hud-value rpg-hud-act">{actRoman(act)}</span>
        </div>
        <div className="rpg-hud-cell">
          <span className="rpg-hud-label">일</span>
          <span className="rpg-hud-value">{day}</span>
        </div>
        <div className="rpg-hud-cell rpg-hud-cell--wide">
          <span className="rpg-hud-label">시</span>
          <span className="rpg-hud-value rpg-hud-time">{time}</span>
        </div>
        <div className="rpg-hud-cell rpg-hud-cell--wide">
          <span className="rpg-hud-label">위치</span>
          <span className="rpg-hud-value rpg-hud-bearing">{locTitle}</span>
        </div>
        <div className={`rpg-hud-cell rpg-hud-cell--mode rpg-hud-cell--${mode}`} title={modeLabel}>
          <span className="rpg-hud-label">정세</span>
          <span className="rpg-hud-value" aria-label={modeLabel}>
            {modeGlyph}
          </span>
        </div>
      </div>
      {weather ? <div className="rpg-hud-weather">{weather}</div> : null}
    </header>
  );
}

// ── Party panel (left) ────────────────────────

function hpTone(pct: number): string {
  if (pct > 0.66) return VERDIGRIS;
  if (pct > 0.33) return ILLUMINATED_COPPER;
  return VERMILION;
}

function VitalBar(props: {
  label: string;
  cur: number;
  max: number;
  color: string;
}): ReactElement {
  const { label, cur, max, color } = props;
  const pct = max > 0 ? clamp(cur / max, 0, 1) : 0;
  const filled = (pct * 100).toFixed(1);
  const rest = (100 - Number(filled)).toFixed(1);
  return (
    <div className="rpg-vital">
      <span className="rpg-vital-label">{label}</span>
      <svg className="rpg-vital-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="3" x2="100" y2="3" className="rpg-vital-track" />
        <line
          x1="0"
          y1="3"
          x2="100"
          y2="3"
          className="rpg-vital-fill"
          style={{ stroke: color, strokeDasharray: `${filled} ${rest}` }}
        />
      </svg>
      <span className="rpg-vital-value" style={{ color }}>
        {cur}
        <span className="rpg-vital-slash">/</span>
        {max}
      </span>
    </div>
  );
}

function ConditionsView(props: { conditions: string[] }): ReactElement | null {
  if (props.conditions.length === 0) return null;
  return (
    <div className="rpg-conditions">
      {props.conditions.map((c, i) => (
        <span key={i} className="rpg-condition">
          {c}
        </span>
      ))}
    </div>
  );
}

function TrustTicks(props: {
  trust: number;
  mode: "active" | "filled";
}): ReactElement {
  const { trust, mode } = props;
  const ticks: ReactElement[] = [];
  for (let i = 0; i < 11; i++) {
    const val = i - 5;
    const active = val === trust;
    const filled =
      mode === "filled" &&
      ((trust >= 0 && val > 0 && val <= trust) ||
        (trust < 0 && val < 0 && val >= trust));
    let c = "rpg-trust-tick";
    if (filled) c += " rpg-trust-tick--fill";
    if (active) c += " rpg-trust-tick--active";
    ticks.push(<span key={i} className={c} data-v={String(val)} />);
  }
  return <>{ticks}</>;
}

function PcCardView(props: {
  pc: PartyData["pc"] | null;
  pcData: PcData | null;
  baseUrl: string;
  charIndex: Map<string, NameMapEntry>;
  fallback: Map<string, string>;
}): ReactElement {
  const { pc, pcData, baseUrl, charIndex, fallback } = props;
  const name = pc?.name ?? pcData?.displayName ?? "여행자";
  const hp = pc?.hp ?? pcData?.hp ?? { current: 20, max: 20 };
  const mp = pc?.mp ?? pcData?.mp ?? { current: 0, max: 0 };
  const conditions = pc?.conditions ?? [];
  const preset = pcData?.preset ?? null;
  const attrs = pcData?.attributes ?? {
    strength: 0,
    agility: 0,
    insight: 0,
    charisma: 0,
  };

  const info = resolvePortrait({
    slug: preset ?? "pc",
    charIndex,
    fallback,
    baseUrl,
  });
  const portraitEl = preset ? (
    info.element
  ) : (
    <div className="rpg-portrait" data-fallback="1">
      <div className="rpg-portrait-halo" />
      <div className="rpg-portrait-fallback" aria-hidden="true">
        {firstChar(name)}
      </div>
    </div>
  );
  const portraitColor = preset ? info.color : VERDIGRIS;

  const presetLabel =
    preset === "warrior"
      ? "전사"
      : preset === "rogue"
        ? "도적"
        : preset === "scholar"
          ? "학자"
          : "프리셋 미선택";

  const hpColor = hpTone(hp.max > 0 ? hp.current / hp.max : 0);
  const mpVisible = mp.max > 0;

  const style = { ["--c" as string]: portraitColor } as CSSProperties;

  const attrRow = (label: string, val: number): ReactElement => {
    const sign = val > 0 ? "+" : val < 0 ? "" : "";
    const cls =
      val > 0 ? "rpg-attr--pos" : val < 0 ? "rpg-attr--neg" : "rpg-attr--zero";
    return (
      <div className={`rpg-attr ${cls}`}>
        <span className="rpg-attr-label">{label}</span>
        <span className="rpg-attr-val">
          {sign}
          {val}
        </span>
      </div>
    );
  };

  return (
    <section className="rpg-member rpg-member--pc" style={style}>
      <header className="rpg-member-head">
        <div className="rpg-member-portrait">{portraitEl}</div>
        <div className="rpg-member-id">
          <div className="rpg-member-role">PC · {presetLabel}</div>
          <div className="rpg-member-name">{name}</div>
        </div>
      </header>
      <div className="rpg-vitals">
        <VitalBar label="HP" cur={hp.current} max={hp.max} color={hpColor} />
        {mpVisible ? (
          <VitalBar label="MP" cur={mp.current} max={mp.max} color={MANUSCRIPT_VIOLET} />
        ) : null}
      </div>
      <div className="rpg-attrs">
        {attrRow("힘", attrs.strength)}
        {attrRow("민첩", attrs.agility)}
        {attrRow("통찰", attrs.insight)}
        {attrRow("화술", attrs.charisma)}
      </div>
      <ConditionsView conditions={conditions} />
    </section>
  );
}

function CompanionCardView(props: {
  slug: string;
  comp: PartyData["companions"][string];
  baseUrl: string;
  charIndex: Map<string, NameMapEntry>;
  fallback: Map<string, string>;
}): ReactElement {
  const { slug, comp, baseUrl, charIndex, fallback } = props;
  if (!comp.in_party) {
    const entry = charIndex.get(slug);
    const name = entry?.displayName ?? slug;
    return (
      <section className="rpg-member rpg-member--absent">
        <header className="rpg-member-head">
          <div className="rpg-member-portrait">
            <div className="rpg-portrait" data-fallback="1">
              <div className="rpg-portrait-fallback" aria-hidden="true">
                {firstChar(name)}
              </div>
            </div>
          </div>
          <div className="rpg-member-id">
            <div className="rpg-member-role">동료 · 이탈</div>
            <div className="rpg-member-name">{name}</div>
          </div>
        </header>
        <div className="rpg-member-absent-note">파티를 떠났다</div>
      </section>
    );
  }

  const info = resolvePortrait({ slug, charIndex, fallback, baseUrl });
  const hpColor = hpTone(comp.hp.max > 0 ? comp.hp.current / comp.hp.max : 0);
  const mpVisible = comp.mp.max > 0;
  const trustSigned = comp.trust > 0 ? `+${comp.trust}` : `${comp.trust}`;
  const trustCls =
    comp.trust > 0
      ? "rpg-trust--pos"
      : comp.trust < 0
        ? "rpg-trust--neg"
        : "rpg-trust--zero";
  const apGlyph =
    comp.approval === "rising"
      ? "↗"
      : comp.approval === "falling"
        ? "↘"
        : "→";

  const style = { ["--c" as string]: info.color } as CSSProperties;

  return (
    <section className="rpg-member rpg-member--comp" style={style}>
      <header className="rpg-member-head">
        <div className="rpg-member-portrait">{info.element}</div>
        <div className="rpg-member-id">
          <div className="rpg-member-role">동료</div>
          <div className="rpg-member-name">{info.displayName}</div>
        </div>
      </header>
      <div className="rpg-vitals">
        <VitalBar label="HP" cur={comp.hp.current} max={comp.hp.max} color={hpColor} />
        {mpVisible ? (
          <VitalBar label="MP" cur={comp.mp.current} max={comp.mp.max} color={MANUSCRIPT_VIOLET} />
        ) : null}
      </div>
      <div className="rpg-trust">
        <span className="rpg-trust-label">TRUST</span>
        <span className="rpg-trust-track">
          <TrustTicks trust={comp.trust} mode="active" />
        </span>
        <span className={`rpg-trust-value ${trustCls}`}>{trustSigned}</span>
        <span className="rpg-trust-arrow" aria-hidden="true">
          {apGlyph}
        </span>
      </div>
      <ConditionsView conditions={comp.conditions} />
    </section>
  );
}

function PartyPanelView(props: {
  party: PartyData | null;
  pcData: PcData | null;
  baseUrl: string;
  charIndex: Map<string, NameMapEntry>;
  fallback: Map<string, string>;
}): ReactElement {
  const { party, pcData, baseUrl, charIndex, fallback } = props;
  return (
    <aside className="rpg-party-panel" aria-label="파티">
      <div className="rpg-panel-head">
        <svg className="rpg-panel-glyph" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="5" cy="5" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
          <circle cx="10" cy="9" r="2" fill="none" stroke="currentColor" strokeWidth="0.8" />
          <path d="M3 13 Q7 10 12 13" fill="none" stroke="currentColor" strokeWidth="0.8" />
        </svg>
        <span className="rpg-panel-title">PARTY</span>
      </div>
      <div className="rpg-party-list">
        <PcCardView
          pc={party?.pc ?? null}
          pcData={pcData}
          baseUrl={baseUrl}
          charIndex={charIndex}
          fallback={fallback}
        />
        {party
          ? Object.entries(party.companions).map(([slug, comp]) => (
              <CompanionCardView
                key={slug}
                slug={slug}
                comp={comp}
                baseUrl={baseUrl}
                charIndex={charIndex}
                fallback={fallback}
              />
            ))
          : null}
      </div>
    </aside>
  );
}

// ── Side panel (right tabs) ───────────────────

function SidePanelView(props: {
  stats: StatsData;
  party: PartyData | null;
  inventory: InventoryData;
  quests: QuestsData;
  world: WorldStateData | null;
  charIndex: Map<string, NameMapEntry>;
}): ReactElement {
  const { stats, party, inventory, quests, world, charIndex } = props;
  return (
    <aside className="rpg-side-panel" aria-label="상세 정보">
      <input type="radio" name="rpg-tab" id="rpg-tab-quest" className="rpg-tab-input" defaultChecked />
      <input type="radio" name="rpg-tab" id="rpg-tab-inv" className="rpg-tab-input" />
      <input type="radio" name="rpg-tab" id="rpg-tab-rel" className="rpg-tab-input" />
      <input type="radio" name="rpg-tab" id="rpg-tab-log" className="rpg-tab-input" />
      <nav className="rpg-tabs" aria-label="우측 탭">
        <label htmlFor="rpg-tab-quest" className="rpg-tab rpg-tab--quest">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <polygon points="6,1 7.5,4.5 11,5 8.5,7.5 9,11 6,9 3,11 3.5,7.5 1,5 4.5,4.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
          </svg>
          <span>퀘스트</span>
        </label>
        <label htmlFor="rpg-tab-inv" className="rpg-tab rpg-tab--inv">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="3" width="8" height="7" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <path d="M4 3 V2 H8 V3" fill="none" stroke="currentColor" strokeWidth="0.8" />
          </svg>
          <span>인벤</span>
        </label>
        <label htmlFor="rpg-tab-rel" className="rpg-tab rpg-tab--rel">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="4" cy="5" r="1.8" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <circle cx="8.5" cy="7" r="1.4" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <path d="M3 10 Q6 9 9.5 10" fill="none" stroke="currentColor" strokeWidth="0.8" />
          </svg>
          <span>관계</span>
        </label>
        <label htmlFor="rpg-tab-log" className="rpg-tab rpg-tab--log">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <line x1="3.5" y1="5" x2="8.5" y2="5" stroke="currentColor" strokeWidth="0.6" />
            <line x1="3.5" y1="7" x2="7" y2="7" stroke="currentColor" strokeWidth="0.6" />
          </svg>
          <span>로그</span>
        </label>
      </nav>
      <div className="rpg-side-stack">
        <div className="rpg-side-panel-body rpg-side-panel-body--quest">
          <QuestPaneView quests={quests} />
        </div>
        <div className="rpg-side-panel-body rpg-side-panel-body--inv">
          <InventoryPaneView inv={inventory} />
        </div>
        <div className="rpg-side-panel-body rpg-side-panel-body--rel">
          <RelationsPaneView stats={stats} party={party} charIndex={charIndex} />
        </div>
        <div className="rpg-side-panel-body rpg-side-panel-body--log">
          <LogPaneView world={world} />
        </div>
      </div>
    </aside>
  );
}

function QuestSection(props: {
  label: string;
  list: QuestEntry[];
}): ReactElement | null {
  const { label, list } = props;
  if (list.length === 0) return null;
  return (
    <div className="rpg-pane-group">
      <div className="rpg-pane-group-head">{label}</div>
      <div className="rpg-pane-group-list">
        {list.map((q) => {
          const statusGlyph =
            q.status === "complete"
              ? "✓"
              : q.status === "failed"
                ? "✗"
                : q.status === "active"
                  ? "∽"
                  : "○";
          const statusCls =
            q.status === "complete"
              ? "rpg-quest-status--done"
              : q.status === "failed"
                ? "rpg-quest-status--fail"
                : q.status === "active"
                  ? "rpg-quest-status--active"
                  : "rpg-quest-status--dormant";
          return (
            <details key={q.slug} className={`rpg-quest ${statusCls}`}>
              <summary className="rpg-quest-head">
                <span className="rpg-quest-status" aria-hidden="true">
                  {statusGlyph}
                </span>
                <span className="rpg-quest-title">{q.title || q.slug}</span>
                <span className="rpg-quest-act">Act {q.act}</span>
              </summary>
              <div className="rpg-quest-body">
                {q.current_step ? (
                  <div className="rpg-quest-step">▸ {q.current_step}</div>
                ) : null}
                {q.description ? (
                  <div className="rpg-quest-desc">{q.description.trim()}</div>
                ) : null}
                {q.steps_completed && q.steps_completed.length > 0 ? (
                  <ul className="rpg-quest-steps">
                    {q.steps_completed.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function QuestPaneView(props: { quests: QuestsData }): ReactElement {
  const { quests } = props;
  const sections: ReactElement[] = [];
  const main = <QuestSection key="main" label="메인" list={quests.quests.main} />;
  const companion = (
    <QuestSection key="companion" label="동료" list={quests.quests.companion} />
  );
  const side = <QuestSection key="side" label="사이드" list={quests.quests.side} />;
  if (quests.quests.main.length > 0) sections.push(main);
  if (quests.quests.companion.length > 0) sections.push(companion);
  if (quests.quests.side.length > 0) sections.push(side);

  if (sections.length === 0) {
    return (
      <div className="rpg-pane rpg-pane--empty">
        아직 진행 중인 퀘스트가 없습니다.
      </div>
    );
  }
  return <div className="rpg-pane">{sections}</div>;
}

function EquipmentRow(props: {
  label: string;
  eq: Equipment | null;
}): ReactElement {
  const { label, eq } = props;
  const hasValue = eq && (eq.name || eq.slug);
  return (
    <div className="rpg-eq-row">
      <span className="rpg-eq-slot">{label}</span>
      <span className="rpg-eq-val">
        {hasValue && eq ? (
          <>
            <span className="rpg-eq-name">{eq.name ?? eq.slug ?? ""}</span>
            {eq.damage ? (
              <span className="rpg-eq-meta">{eq.damage}</span>
            ) : null}
            {eq.soak !== undefined ? (
              <span className="rpg-eq-meta">soak {eq.soak}</span>
            ) : null}
            {eq.schools && eq.schools.length > 0 ? (
              <span className="rpg-eq-meta">{eq.schools.join(" · ")}</span>
            ) : null}
          </>
        ) : (
          <span className="rpg-eq-empty">—</span>
        )}
      </span>
    </div>
  );
}

function InventoryPaneView(props: { inv: InventoryData }): ReactElement {
  const { inv } = props;
  return (
    <div className="rpg-pane">
      <div className="rpg-pane-kv">
        <span className="rpg-kv-label">금화</span>
        <span className="rpg-kv-val rpg-gold">
          {inv.gold} <span className="rpg-gold-unit">크라운</span>
        </span>
      </div>
      <div className="rpg-pane-group">
        <div className="rpg-pane-group-head">장비</div>
        <div className="rpg-eq-list">
          <EquipmentRow label="무기" eq={inv.equipment.weapon} />
          <EquipmentRow label="방어구" eq={inv.equipment.armor} />
          <EquipmentRow label="부속" eq={inv.equipment.accessory} />
        </div>
      </div>
      {inv.items.length > 0 ? (
        <div className="rpg-pane-group">
          <div className="rpg-pane-group-head">소지품</div>
          <ul className="rpg-inv-list">
            {inv.items.map((it) => (
              <li key={it.slug} className="rpg-inv-item">
                <span className="rpg-item-glyph" aria-hidden="true">
                  ·
                </span>
                <span className="rpg-item-name">{it.name || it.slug}</span>
                {it.qty && it.qty > 1 ? (
                  <span className="rpg-item-qty">×{it.qty}</span>
                ) : null}
                {(it.tags ?? []).slice(0, 1).map((t) => (
                  <span key={t} className="rpg-item-tag">
                    {t}
                  </span>
                ))}
                {it.description ? (
                  <span className="rpg-item-desc">{it.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {inv.evidence.length > 0 ? (
        <div className="rpg-pane-group">
          <div className="rpg-pane-group-head">단서 · 증거</div>
          <ul className="rpg-inv-list rpg-inv-list--evidence">
            {inv.evidence.map((e) => (
              <li
                key={e.slug}
                className="rpg-inv-item rpg-inv-item--evidence"
                id={`evidence-${e.slug}`}
              >
                <a
                  className="rpg-item-glyph"
                  href={`#evidence-${e.slug}-modal`}
                  aria-label="단서 펼치기"
                >
                  ⦿
                </a>
                <span className="rpg-item-name">{e.name || e.slug}</span>
                {e.acquired_at_scene ? (
                  <span className="rpg-item-tag">{e.acquired_at_scene}</span>
                ) : null}
                {e.notes ? (
                  <span className="rpg-item-desc">{e.notes}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface RelationRow {
  slug: string;
  name: string;
  trust: number;
  approval?: "rising" | "falling" | "steady";
  isCompanion: boolean;
}

function RelationsPaneView(props: {
  stats: StatsData;
  party: PartyData | null;
  charIndex: Map<string, NameMapEntry>;
}): ReactElement {
  const { stats, party, charIndex } = props;
  const riwu = party?.companions.riwu;
  const rows: RelationRow[] = [];

  if (riwu) {
    const entry = charIndex.get("riwu");
    rows.push({
      slug: "riwu",
      name: entry?.displayName ?? "리우",
      trust: riwu.trust,
      approval: riwu.approval,
      isCompanion: true,
    });
  }
  for (const [slug, trust] of Object.entries(stats.npcs)) {
    const entry = charIndex.get(slug);
    rows.push({
      slug,
      name: entry?.displayName ?? slug,
      trust,
      isCompanion: false,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rpg-pane rpg-pane--empty">
        아직 알려진 인물이 없습니다.
      </div>
    );
  }

  rows.sort((a, b) => {
    if (a.isCompanion && !b.isCompanion) return -1;
    if (!a.isCompanion && b.isCompanion) return 1;
    return b.trust - a.trust;
  });

  return (
    <div className="rpg-pane">
      <ul className="rpg-rel-list">
        {rows.map((r) => {
          const cls =
            r.trust > 0
              ? "rpg-rel--pos"
              : r.trust < 0
                ? "rpg-rel--neg"
                : "rpg-rel--neutral";
          const sign = r.trust > 0 ? `+${r.trust}` : `${r.trust}`;
          const arrow =
            r.approval === "rising"
              ? "↗"
              : r.approval === "falling"
                ? "↘"
                : r.approval === "steady"
                  ? "→"
                  : "";
          return (
            <li key={r.slug} className={`rpg-rel ${cls}`}>
              <div className="rpg-rel-name">
                {r.isCompanion ? (
                  <span className="rpg-rel-badge">동료</span>
                ) : null}
                {r.name}
              </div>
              <div className="rpg-rel-meter">
                <TrustTicks trust={r.trust} mode="filled" />
              </div>
              <div className="rpg-rel-val">
                <span className="rpg-rel-num">{sign}</span>
                {arrow ? (
                  <span className="rpg-rel-arrow" aria-hidden="true">
                    {arrow}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="rpg-rel-legend">
        <span className="rpg-rel-legend-item">
          <span className="rpg-rel-swatch rpg-rel-swatch--neg" />
          적의 (-5)
        </span>
        <span className="rpg-rel-legend-item">
          <span className="rpg-rel-swatch rpg-rel-swatch--neutral" />
          중립 (0)
        </span>
        <span className="rpg-rel-legend-item">
          <span className="rpg-rel-swatch rpg-rel-swatch--pos" />
          동맹 (+5)
        </span>
      </div>
    </div>
  );
}

function LogPaneView(props: {
  world: WorldStateData | null;
}): ReactElement {
  const { world } = props;
  if (!world) {
    return (
      <div className="rpg-pane rpg-pane--empty">
        아직 세계의 시계가 시작되지 않았습니다.
      </div>
    );
  }
  const partyStatusLabel =
    world.party_status === "in_combat"
      ? "전투 중"
      : world.party_status === "resting"
        ? "휴식"
        : world.party_status === "traveling"
          ? "이동 중"
          : "준비";
  return (
    <div className="rpg-pane">
      <div className="rpg-pane-group">
        <div className="rpg-pane-group-head">현재 상황</div>
        <div className="rpg-log-grid">
          <div className="rpg-log-cell">
            <span className="rpg-log-label">막</span>
            <span className="rpg-log-val">Act {actRoman(world.act)}</span>
          </div>
          <div className="rpg-log-cell">
            <span className="rpg-log-label">씬</span>
            <span className="rpg-log-val">{world.current_scene || "—"}</span>
          </div>
          <div className="rpg-log-cell">
            <span className="rpg-log-label">누적</span>
            <span className="rpg-log-val">{world.scene_count}회</span>
          </div>
          <div className="rpg-log-cell">
            <span className="rpg-log-label">일차</span>
            <span className="rpg-log-val">{world.day}일째</span>
          </div>
          <div className="rpg-log-cell">
            <span className="rpg-log-label">시각</span>
            <span className="rpg-log-val">{world.time}</span>
          </div>
          <div className="rpg-log-cell">
            <span className="rpg-log-label">상태</span>
            <span className="rpg-log-val">{partyStatusLabel}</span>
          </div>
        </div>
      </div>
      {world.weather ? (
        <div className="rpg-pane-group">
          <div className="rpg-pane-group-head">날씨</div>
          <div className="rpg-log-weather">{world.weather}</div>
        </div>
      ) : null}
      {world.last_summary ? (
        <div className="rpg-pane-group">
          <div className="rpg-pane-group-head">지난 이야기</div>
          <div className="rpg-log-summary">{world.last_summary.trim()}</div>
        </div>
      ) : null}
    </div>
  );
}

// ── Empty state (no scene yet) ────────────────

const EMPTY_SEEDS_FIRST: ReadonlyArray<{ label: string; action: string }> = [
  { label: "시작", action: "시작" },
  { label: "준비됐어, 시작하자", action: "준비됐어, 시작하자." },
  { label: "이야기를 열어 줘", action: "이야기를 열어 줘." },
];

const EMPTY_SEEDS_CONTINUE: ReadonlyArray<{ label: string; action: string }> = [
  { label: "이어서 시작해 줘", action: "이어서 시작해 줘." },
  { label: "지금 분위기부터 잡아 줘", action: "지금 분위기부터 짧게 잡아 줘." },
];

function EmptySeedsView(props: {
  needsPreset: boolean;
  actions: RendererActions;
}): ReactElement {
  const { needsPreset, actions } = props;
  const seeds = needsPreset ? EMPTY_SEEDS_FIRST : EMPTY_SEEDS_CONTINUE;
  const title = needsPreset ? "이렇게 시작해 보세요" : "이렇게 이어가 보세요";
  return (
    <div className="rpg-seed" role="group" aria-label={title}>
      <div className="rpg-seed-head">
        <span className="rpg-seed-title">{title}</span>
        <span className="rpg-seed-hint">
          누르면 입력창에 채워집니다. 그대로 보내거나 고쳐 써도 됩니다.
        </span>
      </div>
      <div className="rpg-seed-list">
        {seeds.map((s, i) => {
          const style = { ["--i" as string]: String(i) } as CSSProperties;
          return (
            <button
              key={i}
              type="button"
              className="rpg-seed-option"
              style={style}
              onClick={() => actions.fill(s.action)}
            >
              <span className="rpg-seed-mark" aria-hidden="true">
                ❯
              </span>
              <span className="rpg-seed-label">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyReelView(props: {
  pcData: PcData | null;
  actions: RendererActions;
}): ReactElement {
  const { pcData, actions } = props;
  const needsPreset = !pcData || pcData.preset === null;
  return (
    <div className="rpg-empty">
      <svg className="rpg-empty-ico" viewBox="0 0 40 60" aria-hidden="true">
        <path
          d="M20 2 Q8 14 8 28 Q8 42 20 54 Q32 42 32 28 Q32 14 20 2 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
        />
        <circle cx="20" cy="26" r="3.5" className="rpg-empty-eye" />
        <line x1="20" y1="30" x2="20" y2="40" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
      </svg>
      <h2 className="rpg-empty-title">Three Winds await.</h2>
      <p className="rpg-empty-sub">
        {needsPreset
          ? "첫 메시지를 보내면 GM 이 세 명의 프리셋(전사 · 도적 · 학자) 중 하나를 고르게 합니다."
          : "이어갈 준비가 되어 있습니다. 씬을 시작하는 문장을 보내세요."}
      </p>
      <EmptySeedsView needsPreset={needsPreset} actions={actions} />
      <div className="rpg-empty-hint">
        <span className="rpg-empty-hint-mark">★</span>
        플레이어의 대사와 행동만 씁니다. <strong>수치와 판정은 GM 이 자동 처리</strong>합니다.
      </div>
    </div>
  );
}

// ── Pending card ──────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  read: "고문서를 펼친다",
  write: "새 페이지에 기록한다",
  append: "두루마리에 덧붙인다",
  edit: "양피지를 고쳐 쓴다",
  grep: "단서를 추적한다",
  tree: "성채의 지도를 살핀다",
  script: "주문을 외운다",
  activate_skill: "비법서를 펼친다",
};

function toolLabelFor(name: string): string {
  return TOOL_LABELS[name] ?? "비의를 엮는다";
}

function currentTurnAssistantBlocks(state: AgentState): AssistantContentBlock[] {
  let start = 0;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i]?.role === "user") {
      start = i + 1;
      break;
    }
  }

  const blocks: AssistantContentBlock[] = [];
  for (let i = start; i < state.messages.length; i++) {
    const message = state.messages[i];
    if (message?.role === "assistant") blocks.push(...message.content);
  }
  if (state.streamingMessage) blocks.push(...state.streamingMessage.content);
  return blocks;
}

function activeToolCalls(state: AgentState): ToolCall[] {
  const content = currentTurnAssistantBlocks(state);
  return content.filter((b): b is ToolCall => b.type === "toolCall");
}

function findToolResult(
  state: AgentState,
  toolCallId: string,
): ToolResultMessage | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m && m.role === "toolResult" && m.toolCallId === toolCallId) return m;
  }
  return null;
}

function streamingText(state: AgentState): string {
  return currentTurnAssistantBlocks(state)
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function PendingCardView(props: {
  state: AgentState;
  mode: "peace" | "combat";
}): ReactElement {
  const { state, mode } = props;
  const tools = activeToolCalls(state);
  const pendingIds = new Set(state.pendingToolCalls);
  const inFlight =
    tools.find((tc) => pendingIds.has(tc.id)) ??
    tools.find((tc) => !findToolResult(state, tc.id));
  const latest = inFlight ?? tools[tools.length - 1];
  const label = mode === "combat" ? "SALREN이 움직인다" : "잉크가 마르는 중";
  const raw = streamingText(state).trim();
  const clipped = raw.length > 160 ? raw.slice(0, 160) + "…" : raw;
  const toolLabel = latest ? toolLabelFor(latest.name) : "";
  return (
    <aside
      id="rpg-pending"
      className="rpg-pending"
      data-mode={mode}
      hidden={!state.isStreaming}
      role="status"
      aria-live="polite"
    >
      <div className="rpg-pending-head">
        <span className="rpg-pending-glyph" aria-hidden="true" />
        <span>{label}</span>
        <span className="rpg-pending-tool" hidden={!toolLabel}>
          · {toolLabel}
        </span>
      </div>
      <p className="rpg-pending-preview" hidden={!clipped}>
        {clipped}
      </p>
    </aside>
  );
}

// ── Styles ────────────────────────────────────


// ── Main renderer ─────────────────────────────

type MaybeAgentState = Partial<AgentState> | null | undefined;

const EMPTY_STATE: AgentState = {
  messages: [],
  isStreaming: false,
  pendingToolCalls: [],
};

function normalizeState(raw: unknown): AgentState {
  if (!raw || typeof raw !== "object") return EMPTY_STATE;
  const s = raw as MaybeAgentState;
  return {
    messages: Array.isArray(s?.messages) ? s!.messages : [],
    isStreaming: Boolean(s?.isStreaming),
    streamingMessage: s?.streamingMessage,
    pendingToolCalls:
      Array.isArray(s?.pendingToolCalls) ? s.pendingToolCalls : [],
    errorMessage: s?.errorMessage,
  };
}

function RendererContent(props: RendererContentProps): ReactElement {
  const { files, baseUrl, actions } = props;
  const state = normalizeState(props.state);

  // 숨김 파일은 애초에 스캔에서 제외.
  const visible = files.filter(isVisible);

  const charIndex = buildCharacterIndex(visible);
  const fallback = new Map<string, string>();
  const locTitles = buildLocationTitles(visible);

  const party = extractPartyData(visible);
  const stats = extractStatsData(visible);
  const inventory = extractInventoryData(visible);
  const quests = extractQuestsData(visible);
  const world = extractWorldState(visible);
  const pcData = extractPcData(visible);

  const sceneFiles = visible.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );
  const sceneRaw = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n");

  const parsed = parseSceneContent(sceneRaw, charIndex);
  const mode = world?.mode ?? "peace";

  const eventCtx: EventCtx = { baseUrl, charIndex, fallback, actions };
  const choices = extractNextChoices(visible);

  return (
    <>
      <div className="rpg-stage" data-mode={mode}>
        <HudView world={world} locTitles={locTitles} />
        <div className="rpg-grid">
          <PartyPanelView
            party={party}
            pcData={pcData}
            baseUrl={baseUrl}
            charIndex={charIndex}
            fallback={fallback}
          />
          <main className="rpg-reel" data-log={stampCode(sceneRaw || "empty")}>
            <div className="rpg-reel-filigree" aria-hidden="true" />
            {parsed.events.length === 0 ? (
              <EmptyReelView pcData={pcData} actions={actions} />
            ) : (
              <EventsView events={parsed.events} ctx={eventCtx} />
            )}
            <NextChoicesView options={choices} actions={actions} />
          </main>
          <SidePanelView
            stats={stats}
            party={party}
            inventory={inventory}
            quests={quests}
            world={world}
            charIndex={charIndex}
          />
        </div>
        <PendingCardView state={state} mode={mode} />
      </div>
    </>
  );
}



function Renderer({ snapshot, actions }: RendererProps): ReactElement {
  return (
    <RendererContent
      files={[...snapshot.files]}
      baseUrl={snapshot.baseUrl}
      slug={snapshot.slug}
      state={snapshot.state}
      actions={actions}
    />
  );
}

function theme(snapshot: RendererSnapshot): RendererTheme {
  return resolveRendererTheme({ files: [...snapshot.files] });
}

export const renderer = createRenderer(Renderer, { theme });
