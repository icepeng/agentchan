/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
// ─────────────────────────────────────────────────────────────────────────────
//   three-winds-ledger renderer  ·  "Salren — Three Winds Ledger"
//
//   살레른 항구의 3막 서사 RPG. 평상(양피지) ↔ 전투(촛불·피) 이중 테마.
//   3분할 그리드: 좌(파티 카드) · 중앙(씬 본문) · 우(탭 — 인벤/퀘스트/관계/로그).
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ReactElement, ReactNode } from "react";

// ── Types (inline — renderer는 별도 transpile이라 import 불가) ──

type ProjectFile = Agentchan.ProjectFile;
type TextFile = Agentchan.TextFile;
type DataFile = Agentchan.DataFile;
type BinaryFile = Agentchan.BinaryFile;
type AgentState = Agentchan.RendererAgentState;
type RendererActions = Agentchan.RendererActions;

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

// ── Renderer theme contract (인라인 선언) ──

type RendererTheme = Agentchan.RendererTheme;

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
  "validate-renderer": "룬의 균형을 살핀다",
};

function toolLabelFor(name: string): string {
  return TOOL_LABELS[name] ?? "비의를 엮는다";
}

function activeToolCalls(state: AgentState): ToolCall[] {
  const content = state.streamingMessage?.content ?? [];
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
  return (state.streamingMessage?.content ?? [])
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
  const inFlight = tools.find((tc) => !findToolResult(state, tc.id));
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

const STYLES = `
  /* ═════════════════════════════════════════════════════════════
     Web font (Cormorant Garamond) — 르네상스 garalde, 사본 분위기.
     첫 로드 시 ~1초 FOUT 후 안정. 한글은 Pretendard 폴백.
     ═════════════════════════════════════════════════════════════ */
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap');

  /* ═════════════════════════════════════════════════════════════
     Root stage — 3 분할 grid + HUD + 이중 테마
     ═════════════════════════════════════════════════════════════ */
  .rpg-stage {
    /* Illuminated Codex 폰트/색 토큰 — 후손 전체에서 재사용 */
    --rpg-font-display: 'Cormorant Garamond', 'Pretendard Variable', Georgia, 'Times New Roman', serif;
    --rpg-font-body: 'Pretendard Variable', 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
    --rpg-font-num: 'Fira Code', ui-monospace, monospace;
    --rpg-gold: #c9a44c;
    --rpg-wax: #7a2418;
    --rpg-ink: #1a0f08;

    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
    min-height: 100%;
    overflow: hidden;
    position: relative;
    isolation: isolate;
    /* Container query 컨텍스트 — viewport가 아닌 실제 stage 폭에 반응 */
    container-type: inline-size;
    container-name: rpg-stage;
    font-family: var(--rpg-font-body);
    color: var(--color-fg);
    background: var(--color-base);
    transition: background 0.5s ease, color 0.4s ease;
  }
  .rpg-grid {
    display: grid;
    /* 본문(reel) 가독성 우선: 양쪽 패널은 원래 폭으로 줄여 reel에 호흡 확보 */
    grid-template-columns: minmax(220px, 260px) minmax(360px, 1fr) minmax(260px, 320px);
    gap: 1px;
    background: color-mix(in srgb, var(--color-edge) 10%, transparent);
    min-height: 0;
  }
  /* Stage 폭 기준 — webui sidebar/AgentPanel 공존 환경에서도 정확히 동작.
     selector specificity를 올려야 후속 base rule(.rpg-side-panel{display:flex})을 이긴다. */
  @container rpg-stage (max-width: 920px) {
    .rpg-stage .rpg-grid {
      grid-template-columns: 240px minmax(0, 1fr);
    }
    .rpg-stage .rpg-side-panel { display: none; }
  }
  @container rpg-stage (max-width: 620px) {
    .rpg-stage .rpg-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .rpg-stage .rpg-party-panel { display: none; }
  }

  /* ═════════════════════════════════════════════════════════════
     HUD — 시각·위치·막·날씨 스트립
     ═════════════════════════════════════════════════════════════ */
  .rpg-hud {
    display: grid;
    grid-template-columns: minmax(200px, auto) 1fr auto;
    gap: 18px;
    padding: 12px 22px;
    align-items: center;
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 14%, transparent);
    transition: background 0.5s ease, border-color 0.4s ease;
  }
  .rpg-hud-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: ${ILLUMINATED_COPPER};
    min-width: 0;
  }
  .rpg-lantern {
    width: 16px;
    height: 22px;
    color: ${ILLUMINATED_COPPER};
    flex-shrink: 0;
  }
  .rpg-lantern-glow {
    fill: ${ILLUMINATED_COPPER};
    opacity: 0.35;
    animation: rpg-flicker 3.4s ease-in-out infinite;
    transform-origin: center;
  }
  @keyframes rpg-flicker {
    0%, 100% { opacity: 0.32; transform: scale(1); }
    22%      { opacity: 0.48; transform: scale(1.06); }
    41%      { opacity: 0.28; transform: scale(0.96); }
    63%      { opacity: 0.44; transform: scale(1.04); }
    82%      { opacity: 0.3;  transform: scale(0.98); }
  }
  .rpg-hud-title-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  /* Ribbon banner — 사본 챕터 banner 풍 */
  .rpg-hud-title-ribbon {
    display: inline-flex;
    align-items: center;
    margin: 0;
    padding: 4px 14px;
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--rpg-gold) 90%, #fff) 0%,
      var(--rpg-gold) 50%,
      color-mix(in srgb, var(--rpg-gold) 70%, #000) 100%);
    color: var(--rpg-ink);
    box-shadow:
      inset 0 -1px 2px color-mix(in srgb, #000 30%, transparent),
      inset 0 1px 1px color-mix(in srgb, #fff 35%, transparent),
      0 2px 4px color-mix(in srgb, var(--rpg-ink) 20%, transparent);
    position: relative;
  }
  .rpg-ribbon-tip {
    width: 0;
    height: 0;
    flex-shrink: 0;
  }
  .rpg-ribbon-tip--left {
    border-top: 14px solid transparent;
    border-bottom: 14px solid transparent;
    border-right: 8px solid color-mix(in srgb, var(--rpg-gold) 60%, #000);
    margin: -4px 8px -4px -22px;
    filter: drop-shadow(-1px 0 1px color-mix(in srgb, #000 30%, transparent));
  }
  .rpg-ribbon-tip--right {
    border-top: 14px solid transparent;
    border-bottom: 14px solid transparent;
    border-left: 8px solid color-mix(in srgb, var(--rpg-gold) 60%, #000);
    margin: -4px -22px -4px 8px;
    filter: drop-shadow(1px 0 1px color-mix(in srgb, #000 30%, transparent));
  }
  .rpg-hud-title {
    font-family: var(--rpg-font-display);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--rpg-ink);
    line-height: 1.15;
    text-shadow: 0 1px 0 color-mix(in srgb, #fff 35%, transparent);
  }
  .rpg-hud-sub {
    font-family: var(--rpg-font-display);
    font-size: 13px;
    font-style: italic;
    color: var(--color-fg-3);
    letter-spacing: 0.01em;
  }

  .rpg-hud-meta {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: auto;
    gap: 20px;
    justify-content: end;
    align-items: center;
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .rpg-hud-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .rpg-hud-cell--wide { min-width: 110px; }
  .rpg-hud-label {
    font-family: var(--rpg-font-display);
    font-size: 11px;
    font-style: italic;
    letter-spacing: 0.04em;
    color: var(--color-fg-3);
  }
  .rpg-hud-value {
    font-family: var(--rpg-font-display);
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rpg-hud-act {
    font-family: var(--rpg-font-display);
    font-size: 22px;
    font-weight: 600;
    color: ${ILLUMINATED_COPPER};
    letter-spacing: 0;
    line-height: 1;
  }
  .rpg-hud-time, .rpg-hud-bearing {
    font-variant-numeric: tabular-nums;
  }
  /* 모드 뱃지를 wax seal 둥근 인장으로 — peace=verdigris, combat=blood */
  .rpg-hud-cell--mode .rpg-hud-value {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    font-family: var(--rpg-font-display);
    font-size: 18px;
    line-height: 1;
    color: #fdf6e3;
    background: radial-gradient(circle at 35% 30%,
      color-mix(in srgb, ${VERDIGRIS} 80%, #fff) 0%,
      ${VERDIGRIS} 50%,
      color-mix(in srgb, ${VERDIGRIS} 70%, #000) 100%);
    box-shadow:
      inset 0 -2px 4px color-mix(in srgb, #000 35%, transparent),
      inset 0 2px 3px color-mix(in srgb, #fff 25%, transparent),
      0 2px 4px color-mix(in srgb, #000 25%, transparent);
    text-shadow: 0 1px 1px color-mix(in srgb, #000 40%, transparent);
    letter-spacing: 0;
  }
  .rpg-hud-cell--combat .rpg-hud-value {
    background: radial-gradient(circle at 35% 30%,
      color-mix(in srgb, var(--rpg-wax) 80%, #fff) 0%,
      var(--rpg-wax) 50%,
      color-mix(in srgb, var(--rpg-wax) 60%, #000) 100%);
    animation: rpg-alert 1.8s ease-in-out infinite;
  }
  @keyframes rpg-alert {
    0%, 100% { box-shadow:
      inset 0 -2px 4px color-mix(in srgb, #000 35%, transparent),
      inset 0 2px 3px color-mix(in srgb, #fff 25%, transparent),
      0 0 0 0 color-mix(in srgb, var(--rpg-wax) 50%, transparent); }
    50%      { box-shadow:
      inset 0 -2px 4px color-mix(in srgb, #000 35%, transparent),
      inset 0 2px 3px color-mix(in srgb, #fff 25%, transparent),
      0 0 0 5px color-mix(in srgb, var(--rpg-wax) 20%, transparent); }
  }
  .rpg-hud-weather {
    grid-column: 1 / -1;
    font-family: var(--rpg-font-body);
    font-size: 14px;
    font-style: italic;
    color: var(--color-fg-3);
    letter-spacing: 0;
    padding-top: 4px;
  }

  /* ═════════════════════════════════════════════════════════════
     Panel shared — party / side 공통
     ═════════════════════════════════════════════════════════════ */
  .rpg-party-panel, .rpg-side-panel {
    background: color-mix(in srgb, var(--color-surface) 94%, transparent);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .rpg-panel-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 12%, transparent);
    color: var(--color-fg-2);
  }
  .rpg-panel-glyph {
    width: 14px;
    height: 14px;
    color: var(--color-fg-3);
    flex-shrink: 0;
  }
  .rpg-panel-title {
    font-family: var(--rpg-font-display);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-fg);
  }

  /* ═════════════════════════════════════════════════════════════
     Party panel — PC + 동료 카드
     ═════════════════════════════════════════════════════════════ */
  .rpg-party-list {
    flex: 1;
    padding: 16px 14px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }
  .rpg-member {
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding: 14px 14px 16px;
    background: color-mix(in srgb, var(--color-elevated) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--c, var(--color-edge)) 28%, transparent);
    border-left: 3px solid var(--c, var(--color-accent));
    position: relative;
    animation: rpg-card-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .rpg-member--absent {
    opacity: 0.55;
    filter: grayscale(0.4);
  }
  .rpg-member-head {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
  }
  .rpg-member-portrait {
    position: relative;
  }
  .rpg-member-id {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .rpg-member-role {
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-style: italic;
    letter-spacing: 0.02em;
    color: var(--color-fg-3);
  }
  .rpg-member-name {
    font-family: var(--rpg-font-display);
    font-size: 17px;
    font-weight: 600;
    color: var(--color-fg);
    letter-spacing: 0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rpg-member-absent-note {
    font-family: var(--rpg-font-body);
    font-size: 13px;
    font-style: italic;
    color: var(--color-fg-3);
    text-align: center;
    padding: 8px 0;
  }

  /* Portrait (48×48 카드용) */
  .rpg-portrait {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 3px;
    overflow: hidden;
    background: color-mix(in srgb, var(--c, var(--color-accent)) 15%, var(--color-surface));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c, var(--color-accent)) 50%, transparent),
      0 4px 12px -8px rgba(0, 0, 0, 0.2);
  }
  .rpg-portrait-halo {
    position: absolute;
    inset: -35%;
    background: radial-gradient(circle, color-mix(in srgb, var(--c, var(--color-accent)) 55%, transparent), transparent 58%);
    opacity: 0.3;
    filter: blur(14px);
    z-index: 0;
    pointer-events: none;
  }
  .rpg-portrait-img {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
    display: block;
  }
  .rpg-portrait-fallback {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--rpg-font-display);
    font-size: 22px;
    font-weight: 600;
    color: color-mix(in srgb, var(--c, var(--color-accent)) 75%, var(--color-fg-3));
  }
  .rpg-portrait[data-fallback="1"] .rpg-portrait-fallback { z-index: 2; }
  .rpg-portrait[data-fallback="1"] .rpg-portrait-img { visibility: hidden; }

  /* Vitals (HP/MP 바) */
  .rpg-vitals {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .rpg-vital {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .rpg-vital-label {
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-style: italic;
    letter-spacing: 0.02em;
    color: var(--color-fg-3);
  }
  .rpg-vital-bar {
    height: 6px;
    width: 100%;
  }
  .rpg-vital-track {
    stroke: color-mix(in srgb, var(--color-edge) 14%, transparent);
    stroke-width: 1.2;
  }
  .rpg-vital-fill {
    stroke-width: 2.2;
    stroke-linecap: square;
    transition: stroke-dasharray 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    filter: drop-shadow(0 0 3px color-mix(in srgb, currentColor 40%, transparent));
  }
  .rpg-vital-value {
    font-family: var(--rpg-font-num);
    font-size: 12px;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--color-fg);
  }
  .rpg-vital-slash { opacity: 0.45; margin: 0 1px; }

  /* Attributes */
  .rpg-attrs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding-top: 8px;
    border-top: 1px dashed color-mix(in srgb, var(--color-edge) 15%, transparent);
  }
  .rpg-attr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 5px 0;
  }
  .rpg-attr-label {
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-style: italic;
    color: var(--color-fg-3);
  }
  .rpg-attr-val {
    font-family: var(--rpg-font-display);
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .rpg-attr--pos .rpg-attr-val { color: ${VERDIGRIS}; }
  .rpg-attr--neg .rpg-attr-val { color: ${VERMILION}; }
  .rpg-attr--zero .rpg-attr-val { color: var(--color-fg-2); }

  /* Trust (동료 카드 내부) */
  .rpg-trust {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding-top: 6px;
    border-top: 1px dashed color-mix(in srgb, var(--color-edge) 15%, transparent);
  }
  .rpg-trust-label {
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-style: italic;
    color: var(--color-fg-3);
  }
  .rpg-trust-track {
    display: grid;
    grid-template-columns: repeat(11, 1fr);
    gap: 2px;
    align-items: center;
  }
  .rpg-trust-tick {
    height: 6px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--color-edge) 12%, transparent);
    transition: background 0.35s ease, transform 0.25s ease;
  }
  .rpg-trust-tick[data-v="0"] {
    height: 8px;
    background: color-mix(in srgb, var(--color-fg-3) 35%, transparent);
  }
  .rpg-trust-tick--fill { background: color-mix(in srgb, var(--c, ${VERDIGRIS}) 45%, transparent); }
  .rpg-trust-tick--active {
    background: var(--c, ${VERDIGRIS});
    transform: scaleY(1.6);
  }
  .rpg-trust-value {
    font-family: var(--rpg-font-num);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    font-weight: 700;
  }
  .rpg-trust--pos { color: ${VERDIGRIS}; }
  .rpg-trust--neg { color: ${VERMILION}; }
  .rpg-trust--zero { color: var(--color-fg-2); }
  .rpg-trust-arrow {
    font-family: var(--rpg-font-display);
    font-size: 13px;
    color: var(--color-fg-3);
  }

  .rpg-conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding-top: 6px;
  }
  /* condition을 작은 wax seal pill로 — 한글 ‘출혈/독’ 가독성 위해 충분한 사이즈 */
  .rpg-condition {
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 3px 9px;
    border-radius: 999px;
    color: #fdf6e3;
    background: radial-gradient(circle at 35% 30%,
      color-mix(in srgb, var(--rpg-wax) 80%, #fff) 0%,
      var(--rpg-wax) 60%,
      color-mix(in srgb, var(--rpg-wax) 60%, #000) 100%);
    box-shadow:
      inset 0 -1px 2px color-mix(in srgb, #000 30%, transparent),
      inset 0 1px 1px color-mix(in srgb, #fff 22%, transparent);
    text-shadow: 0 1px 1px color-mix(in srgb, #000 35%, transparent);
  }

  @keyframes rpg-card-rise {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ═════════════════════════════════════════════════════════════
     Scene reel (center) — 씬 본문
     ═════════════════════════════════════════════════════════════ */
  .rpg-reel {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 32px 36px 40px;
    display: flex;
    flex-direction: column;
    gap: 28px;
    overflow-y: auto;
    background: var(--color-surface);
    position: relative;
  }
  .rpg-reel::before {
    /* 양피지 결 — 매우 연한 노이즈 감 */
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse at 20% 10%, color-mix(in srgb, ${ILLUMINATED_COPPER} 5%, transparent), transparent 40%),
      radial-gradient(ellipse at 80% 90%, color-mix(in srgb, ${VERDIGRIS} 4%, transparent), transparent 40%);
    opacity: 0.6;
    z-index: 0;
  }
  /* Filigree corner ornaments — reel 4개 코너 사본 장식 (별도 child로 분리해 ::after 충돌 회피) */
  .rpg-reel-filigree {
    position: absolute;
    inset: 14px;
    pointer-events: none;
    z-index: 0;
    background-image:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23b36b2a' stroke-width='1' opacity='0.6'><path d='M2 18 Q2 2 18 2 M22 2 Q14 4 12 8 M2 22 Q4 14 8 12 M14 14 Q18 10 22 10 M14 14 Q10 18 10 22'/></svg>"),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23b36b2a' stroke-width='1' opacity='0.6'><path d='M58 18 Q58 2 42 2 M38 2 Q46 4 48 8 M58 22 Q56 14 52 12 M46 14 Q42 10 38 10 M46 14 Q50 18 50 22'/></svg>"),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23b36b2a' stroke-width='1' opacity='0.6'><path d='M2 42 Q2 58 18 58 M22 58 Q14 56 12 52 M2 38 Q4 46 8 48 M14 46 Q18 50 22 50 M14 46 Q10 42 10 38'/></svg>"),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23b36b2a' stroke-width='1' opacity='0.6'><path d='M58 42 Q58 58 42 58 M38 58 Q46 56 48 52 M58 38 Q56 46 52 48 M46 46 Q42 50 38 50 M46 46 Q50 42 50 38'/></svg>");
    background-position: top left, top right, bottom left, bottom right;
    background-size: 36px 36px;
    background-repeat: no-repeat;
    opacity: 0.85;
  }
  /* Combat 모드는 filigree를 candle 톤으로 — 가죽 표지의 황금 각인 느낌 */
  .rpg-stage[data-mode="combat"] .rpg-reel-filigree {
    background-image:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23d48a1f' stroke-width='1' opacity='0.7'><path d='M2 18 Q2 2 18 2 M22 2 Q14 4 12 8 M2 22 Q4 14 8 12 M14 14 Q18 10 22 10 M14 14 Q10 18 10 22'/></svg>"),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23d48a1f' stroke-width='1' opacity='0.7'><path d='M58 18 Q58 2 42 2 M38 2 Q46 4 48 8 M58 22 Q56 14 52 12 M46 14 Q42 10 38 10 M46 14 Q50 18 50 22'/></svg>"),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23d48a1f' stroke-width='1' opacity='0.7'><path d='M2 42 Q2 58 18 58 M22 58 Q14 56 12 52 M2 38 Q4 46 8 48 M14 46 Q18 50 22 50 M14 46 Q10 42 10 38'/></svg>"),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke='%23d48a1f' stroke-width='1' opacity='0.7'><path d='M58 42 Q58 58 42 58 M38 58 Q46 56 48 52 M58 38 Q56 46 52 48 M46 46 Q42 50 38 50 M46 46 Q50 42 50 38'/></svg>");
  }
  .rpg-reel > * { position: relative; z-index: 1; }

  /* ── User echo (사용자 메시지 에코) ── */
  .rpg-whisper {
    align-self: flex-end;
    max-width: 76%;
    display: inline-flex;
    gap: 12px;
    padding: 10px 22px 12px 26px;
    color: var(--color-fg-2);
    font-family: var(--rpg-font-body);
    font-size: 16px;
    font-style: italic;
    line-height: 1.85;
    border-right: 2px solid color-mix(in srgb, ${VERDIGRIS} 50%, transparent);
    animation: rpg-rise 0.5s ease-out;
  }
  .rpg-whisper-mark {
    font-family: var(--rpg-font-display);
    color: ${VERDIGRIS};
    font-size: 22px;
    line-height: 1;
    padding-top: 4px;
    flex-shrink: 0;
    opacity: 0.6;
  }
  .rpg-whisper-body { text-align: right; }

  /* ── Dialogue plate (캐릭터 대사) ── */
  .rpg-dialogue {
    display: grid;
    grid-template-columns: 60px minmax(0, 1fr);
    gap: 18px;
    align-items: flex-start;
    animation: rpg-rise 0.55s ease-out;
  }
  .rpg-dialogue .rpg-portrait {
    width: 60px;
    height: 60px;
  }
  .rpg-dialogue-caption {
    min-width: 0;
    padding-top: 2px;
  }
  .rpg-nameplate {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
    color: color-mix(in srgb, var(--c) 55%, var(--color-fg));
  }
  .rpg-nameplate-mark {
    width: 24px;
    height: 1px;
    background: currentColor;
    opacity: 0.55;
    align-self: center;
  }
  .rpg-nameplate-name {
    font-family: var(--rpg-font-display);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .rpg-dialogue-body {
    font-family: var(--rpg-font-body);
    font-size: 17px;
    line-height: 1.92;
    color: var(--color-fg);
    padding-left: 16px;
    border-left: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
  }
  .rpg-dialogue:hover .rpg-dialogue-body {
    border-left-color: color-mix(in srgb, var(--c) 55%, transparent);
  }
  .rpg-action {
    font-style: italic;
    color: var(--color-fg-2);
    letter-spacing: 0;
  }

  /* ── Narration ── */
  .rpg-narration {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 18px;
    max-width: 760px;
    margin: 0 auto;
    color: var(--color-fg-2);
    animation: rpg-rise 0.5s ease-out;
  }
  .rpg-narration-rule {
    height: 1px;
    background: color-mix(in srgb, var(--color-edge) 18%, transparent);
  }
  .rpg-narration-text {
    font-family: var(--rpg-font-body);
    font-size: 16px;
    font-style: italic;
    text-align: center;
    line-height: 1.9;
    color: var(--color-fg-2);
    letter-spacing: 0;
  }
  .rpg-narration-text .rpg-action {
    font-style: italic;
    color: inherit;
  }
  /* Drop cap — 씬의 첫 narration 첫 글자에 채식 사본 풍 */
  .rpg-narration--lead .rpg-narration-text {
    text-align: left;
  }
  .rpg-narration--lead .rpg-narration-text::first-letter {
    font-family: var(--rpg-font-display);
    font-style: normal;
    font-weight: 600;
    float: left;
    font-size: 4.6em;
    line-height: 0.86;
    margin: 0.04em 0.12em 0 0;
    color: var(--rpg-gold);
    text-shadow:
      1px 1px 0 color-mix(in srgb, var(--rpg-ink) 60%, transparent),
      0 0 8px color-mix(in srgb, var(--rpg-gold) 35%, transparent);
  }
  .rpg-narration--lead .rpg-narration-rule { display: none; }
  .rpg-narration--lead {
    grid-template-columns: minmax(0, 1fr);
    max-width: 720px;
  }

  /* ── Polaroid (감정 삽화) ── */
  .rpg-polaroid-solo {
    display: flex;
    justify-content: center;
    padding: 4px 0;
    animation: rpg-rise 0.55s ease-out;
  }
  .rpg-polaroid {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    margin: 12px auto;
    padding: 10px 10px 8px;
    background: linear-gradient(180deg,
      var(--color-elevated) 0%,
      color-mix(in srgb, var(--color-fg) 4%, var(--color-elevated)) 100%);
    border: 1px solid color-mix(in srgb, var(--color-edge) 18%, transparent);
    box-shadow:
      0 14px 28px -18px rgba(0, 0, 0, 0.32),
      0 2px 6px -2px rgba(0, 0, 0, 0.18);
    max-width: 280px;
    animation: rpg-polaroid-settle 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease;
  }
  .rpg-polaroid[data-tilt="-2"] { transform: rotate(-2deg); }
  .rpg-polaroid[data-tilt="-1"] { transform: rotate(-1deg); }
  .rpg-polaroid[data-tilt="0"]  { transform: rotate(0deg); }
  .rpg-polaroid[data-tilt="1"]  { transform: rotate(1deg); }
  .rpg-polaroid[data-tilt="2"]  { transform: rotate(2deg); }
  .rpg-polaroid:hover {
    transform: rotate(0deg) translateY(-2px);
  }
  .rpg-polaroid-frame {
    position: relative;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-edge) 8%, transparent);
  }
  .rpg-polaroid-img {
    display: block;
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    filter: saturate(0.85) contrast(1.05) sepia(0.18);
  }
  .rpg-polaroid-gloss {
    position: absolute;
    inset: 0;
    background: linear-gradient(158deg,
      color-mix(in srgb, ${ILLUMINATED_COPPER} 20%, transparent) 0%,
      transparent 44%);
    mix-blend-mode: multiply;
    pointer-events: none;
  }
  .rpg-polaroid-tag {
    margin-top: 10px;
    font-family: var(--rpg-font-display);
    font-size: 13px;
    font-style: italic;
    letter-spacing: 0.01em;
    color: var(--color-fg-3);
    text-align: center;
  }

  /* ── Check block (판정 선택지) ── */
  .rpg-check {
    margin: 10px auto;
    max-width: 660px;
    padding: 16px 18px 18px;
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 5%, var(--color-elevated));
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 35%, transparent);
    animation: rpg-check-unfold 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    transform-origin: top center;
  }
  @keyframes rpg-check-unfold {
    0%   { opacity: 0; transform: scaleY(0.85) translateY(-6px); }
    100% { opacity: 1; transform: scaleY(1) translateY(0); }
  }
  .rpg-check-head {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 12px;
    align-items: center;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px dashed color-mix(in srgb, ${ILLUMINATED_COPPER} 28%, transparent);
  }
  .rpg-check-ico {
    width: 16px;
    height: 16px;
    color: ${ILLUMINATED_COPPER};
    flex-shrink: 0;
  }
  .rpg-check-title {
    font-family: var(--rpg-font-display);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: ${ILLUMINATED_COPPER};
  }
  .rpg-check-hint {
    font-family: var(--rpg-font-body);
    font-size: 13px;
    font-style: italic;
    color: var(--color-fg-3);
    justify-self: end;
    text-align: right;
  }
  .rpg-check-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .rpg-check-option {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    text-align: left;
    font-family: var(--rpg-font-body);
    font-size: 15px;
    color: var(--color-fg);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 2%, var(--color-surface));
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 22%, transparent);
    cursor: pointer;
    transition: transform 0.22s ease, border-color 0.25s ease, background 0.25s ease;
    animation: rpg-check-option-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: calc(var(--i) * 0.06s);
    position: relative;
  }
  @keyframes rpg-check-option-rise {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  /* hover 시 양쪽에 ◆ 장식 글리프 — Cormorant 톤 */
  .rpg-check-option::before,
  .rpg-check-option::after {
    content: "◆";
    color: ${ILLUMINATED_COPPER};
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
  }
  .rpg-check-option::before { left: 4px; }
  .rpg-check-option::after { right: 4px; }
  .rpg-check-option:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 55%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 10%, var(--color-surface));
  }
  .rpg-check-option:hover::before,
  .rpg-check-option:hover::after { opacity: 0.7; }
  .rpg-check-option:focus-visible {
    outline: 2px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 60%, transparent);
    outline-offset: 2px;
  }
  .rpg-check-label {
    color: var(--color-fg);
    line-height: 1.55;
  }
  .rpg-check-meta {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }
  .rpg-check-stat {
    font-family: var(--rpg-font-display);
    font-size: 13px;
    font-style: italic;
    color: var(--color-fg-2);
    padding: 3px 9px;
    background: color-mix(in srgb, ${VERDIGRIS} 10%, transparent);
    border: 1px solid color-mix(in srgb, ${VERDIGRIS} 30%, transparent);
    border-radius: 2px;
  }
  .rpg-check-dc {
    font-family: var(--rpg-font-num);
    font-size: 12px;
    letter-spacing: 0.04em;
    color: ${ILLUMINATED_COPPER};
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  /* ── System block (판정 결과 / 일반 시스템) ── */
  .rpg-system {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    margin: 0 auto;
    max-width: 92%;
    color: var(--color-fg);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 6%, transparent);
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 40%, transparent);
    font-family: var(--rpg-font-display);
    font-size: 14px;
    transform: rotate(-0.3deg);
    animation: rpg-ink 0.55s cubic-bezier(0.22, 1, 0.36, 1);
    flex-wrap: wrap;
    justify-content: center;
    align-self: center;
  }
  .rpg-system-glyph {
    font-size: 18px;
    color: ${ILLUMINATED_COPPER};
    flex-shrink: 0;
  }
  .rpg-system-stat {
    color: var(--color-fg-2);
    letter-spacing: 0;
    font-style: italic;
  }
  .rpg-system-formula {
    color: var(--color-fg);
    font-family: var(--rpg-font-num);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }
  .rpg-system-eq, .rpg-system-sep, .rpg-system-arrow {
    color: var(--color-fg-3);
  }
  .rpg-system-total {
    font-weight: 700;
    color: var(--color-fg);
    font-family: var(--rpg-font-num);
    font-variant-numeric: tabular-nums;
  }
  .rpg-system-dc {
    color: ${ILLUMINATED_COPPER};
    font-family: var(--rpg-font-num);
    font-variant-numeric: tabular-nums;
  }
  .rpg-system-outcome {
    font-family: var(--rpg-font-display);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 10px;
    font-size: 14px;
  }
  .rpg-system--ok {
    border-color: color-mix(in srgb, ${VERDIGRIS} 55%, transparent);
    background: color-mix(in srgb, ${VERDIGRIS} 8%, transparent);
  }
  .rpg-system--ok .rpg-system-glyph,
  .rpg-system--ok .rpg-system-dc,
  .rpg-system--ok .rpg-system-outcome {
    color: ${VERDIGRIS};
  }
  .rpg-system--fail {
    border-color: color-mix(in srgb, ${VERMILION} 55%, transparent);
    background: color-mix(in srgb, ${VERMILION} 8%, transparent);
  }
  .rpg-system--fail .rpg-system-glyph,
  .rpg-system--fail .rpg-system-dc,
  .rpg-system--fail .rpg-system-outcome {
    color: ${VERMILION};
  }
  .rpg-system-body {
    font-family: var(--rpg-font-body);
    font-size: 14px;
    line-height: 1.75;
    text-align: left;
  }
  .rpg-system-line {
    padding: 1px 0;
  }
  @keyframes rpg-ink {
    0%   { opacity: 0; transform: scale(0.94) rotate(-0.3deg); filter: blur(2px); }
    100% { opacity: 1; transform: scale(1) rotate(-0.3deg); filter: blur(0); }
  }

  /* ── Stat (trust 변화 인라인) ── */
  .rpg-stat {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    align-self: flex-start;
    padding: 6px 14px;
    margin: 0 auto 0 0;
    font-family: var(--rpg-font-body);
    font-size: 14px;
    letter-spacing: 0;
    background: color-mix(in srgb, var(--color-fg-3) 6%, transparent);
    border-left: 2px solid var(--color-fg-3);
    animation: rpg-rise 0.45s ease-out;
  }
  .rpg-stat-name {
    font-family: var(--rpg-font-display);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--color-fg);
  }
  .rpg-stat-delta {
    font-family: var(--rpg-font-num);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-size: 14px;
  }
  .rpg-stat-trigger {
    color: var(--color-fg-3);
    font-style: italic;
  }
  .rpg-stat-arrow {
    color: var(--color-fg-3);
    font-size: 14px;
  }
  .rpg-stat--up {
    border-left-color: ${VERDIGRIS};
    background: color-mix(in srgb, ${VERDIGRIS} 6%, transparent);
  }
  .rpg-stat--up .rpg-stat-delta,
  .rpg-stat--up .rpg-stat-arrow { color: ${VERDIGRIS}; }
  .rpg-stat--down {
    border-left-color: ${VERMILION};
    background: color-mix(in srgb, ${VERMILION} 6%, transparent);
  }
  .rpg-stat--down .rpg-stat-delta,
  .rpg-stat--down .rpg-stat-arrow { color: ${VERMILION}; }

  /* ── Ledger entries (item/quest 인라인 고지) ── */
  .rpg-ledger {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    align-self: flex-start;
    padding: 5px 12px;
    font-family: var(--rpg-font-body);
    font-size: 14px;
    color: var(--color-fg-2);
    background: color-mix(in srgb, var(--color-fg-3) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-edge) 14%, transparent);
  }
  .rpg-ledger-glyph {
    font-size: 16px;
    color: ${ILLUMINATED_COPPER};
    text-decoration: none;
  }
  .rpg-ledger-kind {
    font-family: var(--rpg-font-display);
    font-style: italic;
    font-size: 12px;
    letter-spacing: 0;
    color: var(--color-fg-3);
  }
  .rpg-ledger-name {
    color: var(--color-fg);
    font-family: var(--rpg-font-display);
    font-size: 14px;
    font-weight: 600;
  }
  .rpg-ledger-change {
    font-family: var(--rpg-font-num);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .rpg-ledger-desc {
    color: var(--color-fg-3);
    font-style: italic;
  }
  .rpg-ledger--gain { border-color: color-mix(in srgb, ${VERDIGRIS} 35%, transparent); }
  .rpg-ledger--gain .rpg-ledger-glyph { color: ${VERDIGRIS}; }
  .rpg-ledger--spent { border-color: color-mix(in srgb, ${VERMILION} 35%, transparent); opacity: 0.85; }
  .rpg-ledger--spent .rpg-ledger-glyph { color: ${VERMILION}; }
  .rpg-ledger--quest { border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 35%, transparent); }
  .rpg-ledger--quest-done {
    border-color: color-mix(in srgb, ${VERDIGRIS} 55%, transparent);
    background: color-mix(in srgb, ${VERDIGRIS} 6%, transparent);
  }
  .rpg-ledger--quest-done .rpg-ledger-glyph { color: ${VERDIGRIS}; }
  .rpg-ledger--quest-fail {
    border-color: color-mix(in srgb, ${VERMILION} 55%, transparent);
    background: color-mix(in srgb, ${VERMILION} 6%, transparent);
  }
  .rpg-ledger--quest-fail .rpg-ledger-glyph { color: ${VERMILION}; }

  /* ── Divider (사본 풍 fleur-de-lis + trefoil flourish) ── */
  .rpg-divider {
    display: grid;
    grid-template-columns: 1fr auto auto auto 1fr;
    align-items: center;
    gap: 14px;
    margin: 14px auto;
    max-width: 640px;
    color: ${VERDIGRIS};
  }
  .rpg-divider-rule {
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      color-mix(in srgb, ${VERDIGRIS} 45%, transparent) 50%,
      transparent 100%);
  }
  .rpg-divider-rule + .rpg-divider-rule { /* 만약 여러 rule이 인접하면 — 안전망 */
    background: linear-gradient(90deg,
      color-mix(in srgb, ${VERDIGRIS} 35%, transparent) 0%,
      transparent 100%);
  }
  .rpg-divider-flourish {
    font-family: var(--rpg-font-display);
    font-size: 18px;
    color: ${VERDIGRIS};
    opacity: 0.7;
    line-height: 1;
    transform: translateY(-1px);
  }
  .rpg-rose {
    width: 36px;
    height: 36px;
    color: ${VERDIGRIS};
    opacity: 0.92;
    filter: drop-shadow(0 0 6px color-mix(in srgb, ${VERDIGRIS} 25%, transparent));
  }
  .rpg-rose-spin {
    transform-origin: 20px 20px;
    animation: rpg-rose-spin 90s linear infinite;
  }
  @keyframes rpg-rose-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── Combat round (전투 비트) ── */
  .rpg-round {
    margin: 8px 0;
    padding: 14px 18px 18px;
    background: color-mix(in srgb, ${VERMILION} 4%, var(--color-elevated));
    border: 1px solid color-mix(in srgb, ${VERMILION} 25%, transparent);
    border-left: 3px solid ${VERMILION};
    position: relative;
    animation: rpg-round-draw 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes rpg-round-draw {
    0%   { opacity: 0; transform: translateX(-8px); border-left-color: transparent; }
    100% { opacity: 1; transform: translateX(0); border-left-color: ${VERMILION}; }
  }
  .rpg-round-head {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 10px;
    align-items: center;
    margin-bottom: 14px;
  }
  .rpg-round-label {
    font-family: var(--rpg-font-display);
    font-size: 14px;
    font-weight: 600;
    font-style: italic;
    letter-spacing: 0.04em;
    color: ${VERMILION};
  }
  .rpg-round-number {
    font-family: var(--rpg-font-display);
    font-size: 24px;
    font-weight: 600;
    color: ${VERMILION};
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .rpg-round-rule {
    height: 1px;
    background: linear-gradient(90deg,
      color-mix(in srgb, ${VERMILION} 50%, transparent) 0%,
      transparent 100%);
  }
  .rpg-round-flicker {
    color: ${COMBAT_CANDLE};
    opacity: 0.8;
  }
  .rpg-candle {
    width: 12px;
    height: 20px;
  }
  .rpg-candle-flame {
    color: ${COMBAT_CANDLE};
    animation: rpg-flame 2.2s ease-in-out infinite;
    transform-origin: 6px 9px;
  }
  @keyframes rpg-flame {
    0%, 100% { opacity: 0.8; transform: scaleY(1); }
    33%      { opacity: 1;   transform: scaleY(1.15) translateY(-0.5px); }
    66%      { opacity: 0.75; transform: scaleY(0.92); }
  }
  .rpg-round-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ═════════════════════════════════════════════════════════════
     Side panel — 탭 시스템 (CSS :checked 기반)
     ═════════════════════════════════════════════════════════════ */
  .rpg-tab-input {
    position: absolute;
    clip: rect(0,0,0,0);
    clip-path: inset(50%);
    width: 1px; height: 1px;
    overflow: hidden;
    white-space: nowrap;
  }
  .rpg-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: color-mix(in srgb, var(--color-edge) 10%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 12%, transparent);
  }
  .rpg-tab {
    display: grid;
    grid-template-rows: auto auto;
    gap: 4px;
    justify-items: center;
    padding: 12px 4px 11px;
    cursor: pointer;
    color: var(--color-fg-3);
    background: color-mix(in srgb, var(--color-surface) 96%, transparent);
    font-family: var(--rpg-font-display);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
    transition: background 0.2s ease, color 0.2s ease;
  }
  .rpg-tab svg {
    width: 16px;
    height: 16px;
  }
  .rpg-tab:hover {
    color: var(--color-fg);
    background: color-mix(in srgb, var(--color-fg) 4%, var(--color-surface));
  }
  .rpg-side-stack {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .rpg-side-panel-body {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: 14px 16px 20px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  /* 탭 ↔ 패널 매핑 */
  #rpg-tab-quest:checked ~ .rpg-tabs .rpg-tab--quest,
  #rpg-tab-inv:checked   ~ .rpg-tabs .rpg-tab--inv,
  #rpg-tab-rel:checked   ~ .rpg-tabs .rpg-tab--rel,
  #rpg-tab-log:checked   ~ .rpg-tabs .rpg-tab--log {
    color: ${ILLUMINATED_COPPER};
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 8%, var(--color-surface));
    box-shadow: inset 0 -2px 0 ${ILLUMINATED_COPPER};
  }
  #rpg-tab-quest:checked ~ .rpg-side-stack .rpg-side-panel-body--quest,
  #rpg-tab-inv:checked   ~ .rpg-side-stack .rpg-side-panel-body--inv,
  #rpg-tab-rel:checked   ~ .rpg-side-stack .rpg-side-panel-body--rel,
  #rpg-tab-log:checked   ~ .rpg-side-stack .rpg-side-panel-body--log {
    opacity: 1;
    pointer-events: auto;
    z-index: 1;
  }

  .rpg-pane {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .rpg-pane--empty {
    padding: 44px 20px;
    text-align: center;
    color: var(--color-fg-3);
    font-family: var(--rpg-font-body);
    font-size: 14px;
    font-style: italic;
    line-height: 1.7;
  }
  .rpg-pane-group {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .rpg-pane-group-head {
    font-family: var(--rpg-font-display);
    font-size: 13px;
    font-weight: 600;
    font-style: italic;
    letter-spacing: 0.02em;
    color: var(--color-fg-2);
    padding-bottom: 5px;
    border-bottom: 1px dashed color-mix(in srgb, var(--color-edge) 15%, transparent);
  }

  /* Quest pane */
  .rpg-quest {
    border: 1px solid color-mix(in srgb, var(--color-edge) 12%, transparent);
    background: color-mix(in srgb, var(--color-elevated) 60%, transparent);
    margin-bottom: 5px;
    transition: border-color 0.25s ease;
  }
  .rpg-quest:hover { border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 40%, transparent); }
  .rpg-quest-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
    list-style: none;
  }
  .rpg-quest-head::-webkit-details-marker { display: none; }
  .rpg-quest-status {
    font-size: 16px;
    color: var(--color-fg-3);
  }
  .rpg-quest-status--active { color: ${ILLUMINATED_COPPER}; }
  .rpg-quest-status--done { color: ${VERDIGRIS}; }
  .rpg-quest-status--fail { color: ${VERMILION}; }
  .rpg-quest-status--dormant { color: var(--color-fg-4); opacity: 0.6; }
  .rpg-quest-title {
    font-family: var(--rpg-font-display);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-fg);
    letter-spacing: 0.01em;
  }
  .rpg-quest-status--dormant .rpg-quest-title {
    color: var(--color-fg-3);
    font-style: italic;
  }
  .rpg-quest-status--done .rpg-quest-title {
    text-decoration: line-through;
    opacity: 0.7;
  }
  .rpg-quest-act {
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-style: italic;
    letter-spacing: 0.02em;
    color: var(--color-fg-3);
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--color-edge) 20%, transparent);
    border-radius: 2px;
  }
  .rpg-quest-body {
    padding: 6px 16px 14px 38px;
    font-family: var(--rpg-font-body);
    font-size: 14px;
    color: var(--color-fg-2);
    line-height: 1.78;
  }
  .rpg-quest-step {
    color: ${ILLUMINATED_COPPER};
    font-style: italic;
    padding: 4px 0;
  }
  .rpg-quest-desc {
    color: var(--color-fg-2);
    padding: 4px 0;
  }
  .rpg-quest-steps {
    list-style: none;
    padding: 5px 0;
    margin: 0;
  }
  .rpg-quest-steps li {
    padding-left: 14px;
    position: relative;
    color: var(--color-fg-3);
    font-size: 13px;
    line-height: 1.7;
    text-decoration: line-through;
    opacity: 0.7;
  }
  .rpg-quest-steps li::before {
    content: "✓";
    position: absolute;
    left: 0;
    color: ${VERDIGRIS};
    text-decoration: none;
  }

  /* Inventory pane */
  .rpg-pane-kv {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: baseline;
    padding: 7px 0;
    border-bottom: 1px dashed color-mix(in srgb, var(--color-edge) 15%, transparent);
  }
  .rpg-kv-label {
    font-family: var(--rpg-font-display);
    font-size: 13px;
    font-style: italic;
    letter-spacing: 0;
    color: var(--color-fg-3);
  }
  .rpg-kv-val {
    font-family: var(--rpg-font-display);
    font-size: 16px;
    font-weight: 600;
    text-align: right;
    color: var(--color-fg);
  }
  .rpg-gold {
    color: ${ILLUMINATED_COPPER};
    font-family: var(--rpg-font-num);
    font-variant-numeric: tabular-nums;
  }
  .rpg-gold-unit {
    font-family: var(--rpg-font-display);
    font-size: 13px;
    font-style: italic;
    color: var(--color-fg-3);
    margin-left: 5px;
  }
  .rpg-eq-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rpg-eq-row {
    display: grid;
    grid-template-columns: 60px 1fr;
    gap: 12px;
    align-items: baseline;
    padding: 5px 0;
  }
  .rpg-eq-slot {
    font-family: var(--rpg-font-display);
    font-size: 13px;
    font-style: italic;
    letter-spacing: 0;
    color: var(--color-fg-3);
  }
  .rpg-eq-val {
    display: inline-flex;
    gap: 9px;
    flex-wrap: wrap;
    align-items: baseline;
  }
  .rpg-eq-name {
    font-family: var(--rpg-font-body);
    font-size: 14px;
    color: var(--color-fg);
  }
  .rpg-eq-meta {
    font-family: var(--rpg-font-num);
    font-size: 12px;
    color: var(--color-fg-3);
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }
  .rpg-eq-empty {
    color: var(--color-fg-4);
    font-style: italic;
    font-size: 13px;
  }

  .rpg-inv-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rpg-inv-item {
    display: grid;
    grid-template-columns: 18px 1fr auto;
    grid-auto-flow: dense;
    align-items: baseline;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px dotted color-mix(in srgb, var(--color-edge) 10%, transparent);
    font-family: var(--rpg-font-body);
    font-size: 14px;
    line-height: 1.7;
  }
  .rpg-inv-item:last-child { border-bottom: none; }
  .rpg-item-glyph {
    color: var(--color-fg-3);
    font-size: 14px;
    text-align: center;
  }
  .rpg-item-name {
    color: var(--color-fg);
    font-family: var(--rpg-font-body);
  }
  .rpg-item-qty {
    font-family: var(--rpg-font-num);
    font-size: 12px;
    color: var(--color-fg-3);
    font-variant-numeric: tabular-nums;
  }
  .rpg-item-tag {
    font-family: var(--rpg-font-display);
    font-size: 11px;
    font-style: italic;
    letter-spacing: 0;
    color: var(--color-fg-3);
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--color-edge) 18%, transparent);
    border-radius: 2px;
  }
  .rpg-item-desc {
    grid-column: 2 / -1;
    color: var(--color-fg-3);
    font-family: var(--rpg-font-body);
    font-size: 13px;
    font-style: italic;
    line-height: 1.75;
    padding-top: 3px;
  }
  .rpg-inv-item--evidence {
    background: color-mix(in srgb, ${MANUSCRIPT_VIOLET} 5%, transparent);
    border-bottom-color: color-mix(in srgb, ${MANUSCRIPT_VIOLET} 25%, transparent);
  }
  .rpg-inv-item--evidence .rpg-item-glyph {
    color: ${MANUSCRIPT_VIOLET};
  }

  /* Relations pane */
  .rpg-rel-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .rpg-rel {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 12px;
    align-items: center;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--color-elevated) 50%, transparent);
    border-left: 2px solid var(--color-edge);
    transition: border-color 0.3s ease, background 0.3s ease;
  }
  .rpg-rel--pos { border-left-color: ${VERDIGRIS}; }
  .rpg-rel--neg { border-left-color: ${VERMILION}; }
  .rpg-rel-name {
    font-family: var(--rpg-font-display);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--color-fg);
    display: inline-flex;
    gap: 9px;
    align-items: baseline;
  }
  .rpg-rel-badge {
    font-family: var(--rpg-font-display);
    font-size: 11px;
    font-style: italic;
    letter-spacing: 0;
    padding: 2px 8px;
    color: ${VERDIGRIS};
    border: 1px solid color-mix(in srgb, ${VERDIGRIS} 40%, transparent);
    background: color-mix(in srgb, ${VERDIGRIS} 8%, transparent);
    border-radius: 2px;
  }
  .rpg-rel-meter {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(11, 1fr);
    gap: 2px;
  }
  .rpg-rel-val {
    font-family: var(--rpg-font-num);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-weight: 600;
  }
  .rpg-rel--pos .rpg-rel-num { color: ${VERDIGRIS}; font-weight: 700; }
  .rpg-rel--neg .rpg-rel-num { color: ${VERMILION}; font-weight: 700; }
  .rpg-rel-arrow { color: var(--color-fg-3); font-size: 14px; }

  .rpg-rel-legend {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 4px 0;
    border-top: 1px dashed color-mix(in srgb, var(--color-edge) 15%, transparent);
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-style: italic;
    letter-spacing: 0;
    color: var(--color-fg-3);
  }
  .rpg-rel-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .rpg-rel-swatch {
    width: 10px;
    height: 10px;
    display: inline-block;
  }
  .rpg-rel-swatch--neg { background: ${VERMILION}; }
  .rpg-rel-swatch--pos { background: ${VERDIGRIS}; }
  .rpg-rel-swatch--neutral { background: color-mix(in srgb, var(--color-fg-3) 40%, transparent); }

  /* Log pane */
  .rpg-log-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px 12px;
  }
  .rpg-log-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--color-elevated) 40%, transparent);
  }
  .rpg-log-label {
    font-family: var(--rpg-font-display);
    font-size: 12px;
    font-style: italic;
    letter-spacing: 0;
    color: var(--color-fg-3);
  }
  .rpg-log-val {
    font-family: var(--rpg-font-display);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-fg);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }
  .rpg-log-weather {
    padding: 10px 12px;
    font-family: var(--rpg-font-body);
    font-style: italic;
    font-size: 14px;
    line-height: 1.7;
    color: var(--color-fg-2);
    background: color-mix(in srgb, ${MIST_BLUE} 6%, transparent);
    border-left: 2px solid ${MIST_BLUE};
  }
  .rpg-log-summary {
    padding: 10px 12px;
    font-family: var(--rpg-font-body);
    font-size: 14px;
    color: var(--color-fg-2);
    line-height: 1.78;
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 5%, transparent);
    border-left: 2px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 40%, transparent);
    font-style: italic;
    white-space: pre-line;
  }

  /* ═════════════════════════════════════════════════════════════
     Empty state
     ═════════════════════════════════════════════════════════════ */
  .rpg-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 72px 24px 48px;
    text-align: center;
    min-height: 400px;
  }
  .rpg-empty-ico {
    width: 48px;
    height: 72px;
    color: var(--color-fg-3);
  }
  .rpg-empty-eye {
    fill: ${ILLUMINATED_COPPER};
    opacity: 0.8;
    animation: rpg-pulse 2.6s ease-in-out infinite;
  }
  @keyframes rpg-pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); transform-origin: 20px 26px; }
    50%      { opacity: 1;   transform: scale(1.25); transform-origin: 20px 26px; }
  }
  .rpg-empty-title {
    margin: 0;
    font-family: var(--rpg-font-display);
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--color-fg);
  }
  .rpg-empty-sub {
    margin: 0;
    max-width: 460px;
    font-family: var(--rpg-font-body);
    font-size: 14px;
    font-style: italic;
    line-height: 1.85;
    color: var(--color-fg-3);
  }
  .rpg-empty-hint {
    margin-top: 14px;
    padding: 12px 18px;
    max-width: 480px;
    font-family: var(--rpg-font-body);
    font-size: 13px;
    line-height: 1.7;
    color: var(--color-fg-2);
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 30%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 5%, transparent);
    display: inline-flex;
    gap: 10px;
    align-items: center;
    text-align: left;
  }
  .rpg-empty-hint-mark {
    color: ${ILLUMINATED_COPPER};
    flex-shrink: 0;
  }

  /* ── Empty state seeds (첫 입력 예시) ──
     rpg-check-option 의 양피지 톤을 축약. 중립적 "시작" 트리거이므로
     DC/stat 배지는 없고, chevron glyph 하나로 행동 유도만 한다. */
  .rpg-seed {
    margin-top: 6px;
    padding: 14px 16px 16px;
    width: min(100%, 460px);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 4%, var(--color-elevated));
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 24%, transparent);
    text-align: left;
    animation: rpg-check-unfold 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    transform-origin: top center;
  }
  .rpg-seed-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px dashed color-mix(in srgb, ${ILLUMINATED_COPPER} 24%, transparent);
  }
  .rpg-seed-title {
    font-family: var(--rpg-font-display);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: ${ILLUMINATED_COPPER};
  }
  .rpg-seed-hint {
    font-family: var(--rpg-font-body);
    font-size: 12px;
    font-style: italic;
    color: var(--color-fg-3);
  }
  .rpg-seed-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .rpg-seed-option {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    text-align: left;
    font-family: var(--rpg-font-body);
    font-size: 14px;
    color: var(--color-fg);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 2%, var(--color-surface));
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 18%, transparent);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.22s ease, background 0.22s ease;
    animation: rpg-check-option-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: calc(var(--i) * 0.06s);
  }
  .rpg-seed-option:hover {
    border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 42%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 7%, var(--color-surface));
    transform: translateX(2px);
  }
  .rpg-seed-option:focus-visible {
    outline: 2px solid ${ILLUMINATED_COPPER};
    outline-offset: 2px;
  }
  .rpg-seed-mark {
    color: ${ILLUMINATED_COPPER};
    font-size: 12px;
    opacity: 0.7;
  }
  .rpg-seed-label {
    font-family: var(--rpg-font-body);
  }

  /* ═════════════════════════════════════════════════════════════
     Global shared animations
     ═════════════════════════════════════════════════════════════ */
  @keyframes rpg-rise {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes rpg-polaroid-settle {
    0%   { opacity: 0; transform: translateY(-10px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ═════════════════════════════════════════════════════════════
     COMBAT THEME — data-mode="combat" 시 후손 전체 override
     평상(양피지) → 전투(촛불·가죽·피).
     ═════════════════════════════════════════════════════════════ */
  .rpg-stage[data-mode="combat"] {
    background: ${COMBAT_BASE};
    color: ${COMBAT_PARCH};
  }
  .rpg-stage[data-mode="combat"] .rpg-hud {
    background: color-mix(in srgb, ${COMBAT_SURFACE} 90%, transparent);
    border-bottom-color: color-mix(in srgb, ${COMBAT_BLOOD} 30%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-hud-brand,
  .rpg-stage[data-mode="combat"] .rpg-lantern { color: ${COMBAT_CANDLE}; }
  .rpg-stage[data-mode="combat"] .rpg-lantern-glow { fill: ${COMBAT_CANDLE}; opacity: 0.55; }
  /* Combat: ribbon이 황금 → 갈색 가죽으로, 글자 candle 색 */
  .rpg-stage[data-mode="combat"] .rpg-hud-title-ribbon {
    background: linear-gradient(180deg,
      color-mix(in srgb, ${COMBAT_BLOOD} 70%, #2a1610) 0%,
      color-mix(in srgb, ${COMBAT_BLOOD} 50%, #1a0808) 50%,
      color-mix(in srgb, ${COMBAT_BLOOD} 40%, #000) 100%);
  }
  .rpg-stage[data-mode="combat"] .rpg-ribbon-tip--left {
    border-right-color: color-mix(in srgb, ${COMBAT_BLOOD} 30%, #000);
  }
  .rpg-stage[data-mode="combat"] .rpg-ribbon-tip--right {
    border-left-color: color-mix(in srgb, ${COMBAT_BLOOD} 30%, #000);
  }
  .rpg-stage[data-mode="combat"] .rpg-hud-title {
    color: ${COMBAT_CANDLE};
    text-shadow: 0 1px 0 color-mix(in srgb, #000 50%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-hud-sub,
  .rpg-stage[data-mode="combat"] .rpg-hud-label { color: ${COMBAT_FG3}; }
  .rpg-stage[data-mode="combat"] .rpg-hud-value { color: ${COMBAT_PARCH}; }
  .rpg-stage[data-mode="combat"] .rpg-hud-act { color: ${COMBAT_CANDLE}; }
  .rpg-stage[data-mode="combat"] .rpg-hud-weather { color: ${COMBAT_FG3}; }

  .rpg-stage[data-mode="combat"] .rpg-grid {
    background: color-mix(in srgb, ${COMBAT_BLOOD} 20%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-party-panel,
  .rpg-stage[data-mode="combat"] .rpg-side-panel {
    background: ${COMBAT_SURFACE};
  }
  .rpg-stage[data-mode="combat"] .rpg-panel-head {
    border-bottom-color: color-mix(in srgb, ${COMBAT_BLOOD} 35%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-panel-title,
  .rpg-stage[data-mode="combat"] .rpg-panel-glyph { color: ${COMBAT_FG2}; }

  .rpg-stage[data-mode="combat"] .rpg-reel {
    background:
      radial-gradient(ellipse at 50% 0%, color-mix(in srgb, ${COMBAT_CANDLE} 8%, transparent), transparent 45%),
      ${COMBAT_BASE};
  }
  .rpg-stage[data-mode="combat"] .rpg-reel::before {
    background:
      radial-gradient(ellipse at 20% 10%, color-mix(in srgb, ${COMBAT_BLOOD} 8%, transparent), transparent 40%),
      radial-gradient(ellipse at 80% 90%, color-mix(in srgb, ${COMBAT_CANDLE} 6%, transparent), transparent 40%);
    opacity: 0.8;
  }
  .rpg-stage[data-mode="combat"] .rpg-reel::after {
    /* 촛불 흔들림 광원 (전투 테마 전용). stage 내부에 한정 (fixed 아님). */
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(circle at 50% 0%,
      color-mix(in srgb, ${COMBAT_CANDLE} 8%, transparent) 0%,
      transparent 45%);
    animation: rpg-light-breath 4s ease-in-out infinite;
    z-index: 0;
  }
  @keyframes rpg-light-breath {
    0%, 100% { opacity: 0.6; transform: translateY(0); }
    50%      { opacity: 1;   transform: translateY(-2px); }
  }

  .rpg-stage[data-mode="combat"] .rpg-member {
    background: color-mix(in srgb, ${COMBAT_SURFACE} 85%, transparent);
    border-color: color-mix(in srgb, ${COMBAT_BLOOD} 35%, transparent);
    border-left-color: var(--c, ${COMBAT_BLOOD});
    box-shadow: 0 0 0 1px color-mix(in srgb, ${COMBAT_BLOOD} 10%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-member-name { color: ${COMBAT_PARCH}; }
  .rpg-stage[data-mode="combat"] .rpg-member-role,
  .rpg-stage[data-mode="combat"] .rpg-vital-label,
  .rpg-stage[data-mode="combat"] .rpg-trust-label,
  .rpg-stage[data-mode="combat"] .rpg-attr-label { color: ${COMBAT_FG3}; }
  .rpg-stage[data-mode="combat"] .rpg-attr--zero .rpg-attr-val { color: ${COMBAT_FG2}; }
  .rpg-stage[data-mode="combat"] .rpg-vital-track {
    stroke: color-mix(in srgb, ${COMBAT_BLOOD} 25%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-trust-tick {
    background: color-mix(in srgb, ${COMBAT_FG3} 20%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-trust-tick[data-v="0"] {
    background: color-mix(in srgb, ${COMBAT_FG3} 45%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-trust--zero { color: ${COMBAT_FG2}; }

  .rpg-stage[data-mode="combat"] .rpg-whisper {
    color: ${COMBAT_FG2};
    border-right-color: color-mix(in srgb, ${COMBAT_CANDLE} 50%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-whisper-mark { color: ${COMBAT_FG3}; }
  .rpg-stage[data-mode="combat"] .rpg-dialogue-body {
    color: ${COMBAT_PARCH};
    border-left-color: color-mix(in srgb, var(--c) 50%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-nameplate {
    color: color-mix(in srgb, var(--c) 65%, ${COMBAT_PARCH});
  }
  .rpg-stage[data-mode="combat"] .rpg-action { color: ${COMBAT_FG2}; }

  .rpg-stage[data-mode="combat"] .rpg-narration,
  .rpg-stage[data-mode="combat"] .rpg-narration-text { color: ${COMBAT_FG2}; }
  .rpg-stage[data-mode="combat"] .rpg-narration-rule {
    background: color-mix(in srgb, ${COMBAT_BLOOD} 25%, transparent);
  }

  .rpg-stage[data-mode="combat"] .rpg-polaroid {
    background: linear-gradient(180deg, ${COMBAT_SURFACE} 0%, ${COMBAT_BASE} 100%);
    border-color: color-mix(in srgb, ${COMBAT_BLOOD} 35%, transparent);
    box-shadow:
      0 14px 30px -16px rgba(0, 0, 0, 0.7),
      0 2px 6px -2px rgba(0, 0, 0, 0.5);
  }
  .rpg-stage[data-mode="combat"] .rpg-polaroid-img {
    filter: saturate(0.7) contrast(1.1) brightness(0.85);
  }
  .rpg-stage[data-mode="combat"] .rpg-polaroid-gloss {
    background: linear-gradient(158deg,
      color-mix(in srgb, ${COMBAT_CANDLE} 18%, transparent) 0%,
      transparent 44%);
    mix-blend-mode: screen;
  }
  .rpg-stage[data-mode="combat"] .rpg-polaroid-tag { color: ${COMBAT_FG3}; }

  .rpg-stage[data-mode="combat"] .rpg-check {
    background: color-mix(in srgb, ${COMBAT_CANDLE} 6%, ${COMBAT_SURFACE});
    border-color: color-mix(in srgb, ${COMBAT_CANDLE} 40%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-check-title,
  .rpg-stage[data-mode="combat"] .rpg-check-ico { color: ${COMBAT_CANDLE}; }
  .rpg-stage[data-mode="combat"] .rpg-check-hint { color: ${COMBAT_FG3}; }
  .rpg-stage[data-mode="combat"] .rpg-check-option {
    background: color-mix(in srgb, ${COMBAT_CANDLE} 2%, ${COMBAT_BASE});
    border-color: color-mix(in srgb, ${COMBAT_CANDLE} 25%, transparent);
    color: ${COMBAT_PARCH};
  }
  .rpg-stage[data-mode="combat"] .rpg-check-option:hover {
    background: color-mix(in srgb, ${COMBAT_CANDLE} 8%, ${COMBAT_BASE});
    border-color: color-mix(in srgb, ${COMBAT_CANDLE} 55%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-check-dc { color: ${COMBAT_CANDLE}; }

  .rpg-stage[data-mode="combat"] .rpg-system {
    background: color-mix(in srgb, ${COMBAT_BLOOD} 10%, ${COMBAT_SURFACE});
    border-color: color-mix(in srgb, ${COMBAT_BLOOD} 50%, transparent);
    color: ${COMBAT_PARCH};
  }
  .rpg-stage[data-mode="combat"] .rpg-system-glyph,
  .rpg-stage[data-mode="combat"] .rpg-system-dc { color: ${COMBAT_CANDLE}; }
  .rpg-stage[data-mode="combat"] .rpg-system--ok {
    border-color: color-mix(in srgb, ${VERDIGRIS} 70%, transparent);
    background: color-mix(in srgb, ${VERDIGRIS} 14%, ${COMBAT_SURFACE});
  }
  .rpg-stage[data-mode="combat"] .rpg-system--fail {
    border-color: color-mix(in srgb, ${COMBAT_BLOOD} 70%, transparent);
    background: color-mix(in srgb, ${COMBAT_BLOOD} 14%, ${COMBAT_SURFACE});
  }

  .rpg-stage[data-mode="combat"] .rpg-round {
    background: linear-gradient(180deg,
      color-mix(in srgb, ${COMBAT_BLOOD} 8%, ${COMBAT_SURFACE}) 0%,
      ${COMBAT_SURFACE} 100%);
    border-color: color-mix(in srgb, ${COMBAT_BLOOD} 50%, transparent);
    border-left-color: ${COMBAT_BLOOD};
    box-shadow: inset 0 0 40px -15px color-mix(in srgb, ${COMBAT_BLOOD} 30%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-round-label,
  .rpg-stage[data-mode="combat"] .rpg-round-number { color: ${COMBAT_BLOOD}; }
  .rpg-stage[data-mode="combat"] .rpg-round-rule {
    background: linear-gradient(90deg,
      color-mix(in srgb, ${COMBAT_BLOOD} 60%, transparent) 0%,
      transparent 100%);
  }

  .rpg-stage[data-mode="combat"] .rpg-stat {
    background: color-mix(in srgb, ${COMBAT_FG3} 8%, ${COMBAT_SURFACE});
  }
  .rpg-stage[data-mode="combat"] .rpg-stat-name { color: ${COMBAT_PARCH}; }
  .rpg-stage[data-mode="combat"] .rpg-stat-trigger { color: ${COMBAT_FG3}; }

  .rpg-stage[data-mode="combat"] .rpg-ledger {
    background: color-mix(in srgb, ${COMBAT_FG3} 8%, ${COMBAT_SURFACE});
    border-color: color-mix(in srgb, ${COMBAT_BLOOD} 25%, transparent);
    color: ${COMBAT_FG2};
  }
  .rpg-stage[data-mode="combat"] .rpg-ledger-name { color: ${COMBAT_PARCH}; }

  .rpg-stage[data-mode="combat"] .rpg-tabs {
    background: color-mix(in srgb, ${COMBAT_BLOOD} 25%, transparent);
    border-bottom-color: color-mix(in srgb, ${COMBAT_BLOOD} 35%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-tab {
    background: ${COMBAT_SURFACE};
    color: ${COMBAT_FG3};
  }
  .rpg-stage[data-mode="combat"] .rpg-tab:hover {
    color: ${COMBAT_PARCH};
    background: color-mix(in srgb, ${COMBAT_CANDLE} 6%, ${COMBAT_SURFACE});
  }
  .rpg-stage[data-mode="combat"] #rpg-tab-quest:checked ~ .rpg-tabs .rpg-tab--quest,
  .rpg-stage[data-mode="combat"] #rpg-tab-inv:checked   ~ .rpg-tabs .rpg-tab--inv,
  .rpg-stage[data-mode="combat"] #rpg-tab-rel:checked   ~ .rpg-tabs .rpg-tab--rel,
  .rpg-stage[data-mode="combat"] #rpg-tab-log:checked   ~ .rpg-tabs .rpg-tab--log {
    color: ${COMBAT_CANDLE};
    background: color-mix(in srgb, ${COMBAT_CANDLE} 10%, ${COMBAT_SURFACE});
    box-shadow: inset 0 -2px 0 ${COMBAT_CANDLE};
  }
  .rpg-stage[data-mode="combat"] .rpg-quest {
    background: color-mix(in srgb, ${COMBAT_SURFACE} 70%, transparent);
    border-color: color-mix(in srgb, ${COMBAT_BLOOD} 25%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-quest-title { color: ${COMBAT_PARCH}; }
  .rpg-stage[data-mode="combat"] .rpg-quest-body { color: ${COMBAT_FG2}; }
  .rpg-stage[data-mode="combat"] .rpg-log-cell,
  .rpg-stage[data-mode="combat"] .rpg-eq-val .rpg-eq-name,
  .rpg-stage[data-mode="combat"] .rpg-kv-val { color: ${COMBAT_PARCH}; }
  .rpg-stage[data-mode="combat"] .rpg-log-cell {
    background: color-mix(in srgb, ${COMBAT_SURFACE} 80%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-log-val { color: ${COMBAT_PARCH}; }
  .rpg-stage[data-mode="combat"] .rpg-log-summary,
  .rpg-stage[data-mode="combat"] .rpg-log-weather { color: ${COMBAT_FG2}; }
  .rpg-stage[data-mode="combat"] .rpg-rel {
    background: color-mix(in srgb, ${COMBAT_SURFACE} 70%, transparent);
  }
  .rpg-stage[data-mode="combat"] .rpg-rel-name { color: ${COMBAT_PARCH}; }

  .rpg-stage[data-mode="combat"] .rpg-divider { color: ${COMBAT_CANDLE}; }
  .rpg-stage[data-mode="combat"] .rpg-divider-rule {
    background: linear-gradient(90deg,
      transparent 0%,
      color-mix(in srgb, ${COMBAT_CANDLE} 50%, transparent) 50%,
      transparent 100%);
  }
  .rpg-stage[data-mode="combat"] .rpg-rose { color: ${COMBAT_CANDLE}; }

  /* ═════════════════════════════════════════════════════════════
     Accessibility — reduced motion
     stage 안쪽의 모든 애니메이션·전환을 0.01ms 로 단축.
     ═════════════════════════════════════════════════════════════ */
  @media (prefers-reduced-motion: reduce) {
    .rpg-stage,
    .rpg-stage *,
    .rpg-stage *::before,
    .rpg-stage *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      animation-delay: 0ms !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* ═════════════════════════════════════════════════════════════
     Responsive tweaks (container-query 기반 — stage 폭에 반응)
     ═════════════════════════════════════════════════════════════ */
  @container rpg-stage (max-width: 920px) {
    .rpg-hud {
      grid-template-columns: auto 1fr;
    }
    .rpg-hud-meta {
      grid-auto-flow: row;
      grid-auto-columns: unset;
      grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
      gap: 8px 12px;
      justify-content: start;
    }
  }
  @container rpg-stage (max-width: 620px) {
    .rpg-reel { padding: 22px 18px 28px; gap: 22px; }
    .rpg-reel-filigree { inset: 8px; background-size: 28px 28px; }
    .rpg-dialogue { grid-template-columns: 48px minmax(0, 1fr); gap: 14px; }
    .rpg-dialogue .rpg-portrait { width: 48px; height: 48px; }
    .rpg-whisper { max-width: 86%; font-size: 15px; }
    .rpg-narration--lead .rpg-narration-text::first-letter { font-size: 4em; }
    .rpg-check-head { grid-template-columns: auto 1fr; }
    .rpg-check-hint { grid-column: 1 / -1; justify-self: start; text-align: left; }
    .rpg-pending { padding: 12px 18px 14px; }
  }
  /* 매우 좁은 reel (드롭캡이 한글 wrap을 깨뜨릴 수 있는 폭) — 드롭캡 비활성 */
  @container rpg-stage (max-width: 460px) {
    .rpg-narration--lead .rpg-narration-text {
      text-align: center;
    }
    .rpg-narration--lead .rpg-narration-text::first-letter {
      float: none;
      font-size: 1em;
      color: inherit;
      text-shadow: none;
      margin: 0;
    }
  }

  /* ── PENDING CARD ── stage grid의 세 번째 row(auto)에 고정 — 채팅바 바로 위 sentinel */
  .rpg-pending {
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 12px 36px 14px;
    border-top: 1px solid color-mix(in srgb, var(--rpg-gold) 50%, transparent);
    background:
      linear-gradient(180deg,
        color-mix(in srgb, var(--color-elevated) 94%, transparent),
        color-mix(in srgb, var(--color-elevated) 98%, transparent));
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: rpg-pending-fade 0.4s ease-out;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .rpg-pending[data-mode="combat"] {
    border-top-color: color-mix(in srgb, var(--rpg-wax) 60%, transparent);
    background:
      linear-gradient(180deg,
        color-mix(in srgb, ${COMBAT_SURFACE} 94%, transparent),
        color-mix(in srgb, ${COMBAT_SURFACE} 98%, transparent));
  }
  .rpg-pending-head {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--rpg-font-display);
    font-size: 13px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--rpg-gold);
  }
  .rpg-pending[data-mode="combat"] .rpg-pending-head {
    color: var(--rpg-wax);
  }
  .rpg-pending-glyph {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px color-mix(in srgb, currentColor 80%, transparent);
    animation: rpg-pending-breathe 1.8s ease-in-out infinite;
    flex-shrink: 0;
  }
  .rpg-pending-tool {
    margin-left: auto;
    font-family: var(--rpg-font-body);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: color-mix(in srgb, var(--color-fg-3) 80%, currentColor);
    text-transform: none;
  }
  .rpg-pending-preview {
    margin: 0;
    font-family: var(--rpg-font-body);
    font-style: italic;
    font-size: 14px;
    line-height: 1.6;
    color: color-mix(in srgb, var(--color-fg-2) 85%, var(--rpg-ink));
    border-left: 2px solid color-mix(in srgb, var(--rpg-gold) 35%, transparent);
    padding-left: 10px;
  }
  .rpg-pending[data-mode="combat"] .rpg-pending-preview {
    border-left-color: color-mix(in srgb, var(--rpg-wax) 50%, transparent);
  }
  @keyframes rpg-pending-fade {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes rpg-pending-breathe {
    0%, 100% { opacity: 0.5; transform: scale(0.85); }
    50%      { opacity: 1;   transform: scale(1.15); }
  }
`;

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
      <style>{STYLES}</style>
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
            <div data-chat-anchor />
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



export default function Renderer({ snapshot, actions }: Agentchan.RendererProps): ReactElement {
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

export function theme(snapshot: Agentchan.RendererSnapshot): Agentchan.RendererTheme {
  return resolveRendererTheme({ files: [...snapshot.files] });
}
