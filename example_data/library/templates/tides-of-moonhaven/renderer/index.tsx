/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
import "./index.css";
// ─────────────────────────────────────────────────────────────────────────────
//   tides-of-moonhaven renderer  ·  "Vellum Day — Cartographer's Logbook"
//
//   햇빛 아래 펼쳐놓은 지도 제작자의 illuminated manuscript.
//   화면은 게임 UI가 아니라 크림 양피지 위에 손으로 기록되는 로그북이다.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";

// ── Inline types (렌더러는 별도 transpile → import 불가) ──────────────────────

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
  arguments: Record<string, any>;
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

type RendererTheme = Agentchan.RendererTheme;

interface RendererContentProps {
  state: AgentState;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
}

interface RenderCtx {
  files: ProjectFile[];
  baseUrl: string;
  state: AgentState;
}

// ── Theme ────────────────────────────────────────────────────────────────────

const PEACE_THEME: RendererTheme = {
  base: {
    void: "#e8dcc0",
    base: "#eee3c8",
    surface: "#f6ecd2",
    elevated: "#fff8e4",
    accent: "#3d7a6d",
    fg: "#2d2015",
    fg2: "#5a4530",
    fg3: "#8a6e4d",
    edge: "#3d2a15",
  },
  prefersScheme: "light",
};

const COMBAT_THEME: RendererTheme = {
  base: {
    void: "#1a110a",
    base: "#1a110a",
    surface: "#251810",
    elevated: "#2e1c14",
    accent: "#d48a1f",
    fg: "#d8c9a8",
    fg2: "#b8a38a",
    fg3: "#8a7658",
    edge: "#3d2a1f",
  },
  prefersScheme: "dark",
};

function readWorldMode(files: ProjectFile[]): "peace" | "combat" {
  const file = files.find(
    (f): f is DataFile => f.type === "data" && f.path === "world-state.yaml",
  );
  if (!file) return "peace";
  const root =
    file.data && typeof file.data === "object"
      ? (file.data as Record<string, unknown>)
      : null;
  if (!root) return "peace";
  return root.mode === "combat" ? "combat" : "peace";
}

function resolveRendererTheme(ctx: { files: ProjectFile[] }): RendererTheme {
  return readWorldMode(ctx.files) === "combat" ? COMBAT_THEME : PEACE_THEME;
}

// ── Palette ──────────────────────────────────────────────────────────────────

const ILLUMINATED_COPPER = "#b36b2a";
const VERDIGRIS = "#3d7a6d";
const VERMILION = "#a83225";

const CHARACTER_COLORS = [
  "#3d7a6d",
  "#b36b2a",
  "#6a45a0",
  "#a83a70",
  "#4a7a3a",
  "#c84a28",
  "#2a5a8a",
  "#8a3a2d",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageUrl(ctx: RenderCtx, dir: string, imageKey: string): string {
  return `${ctx.baseUrl}/files/${dir}/${imageKey}`;
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

// ── Chat / RPG types ────────────────────────────────────────────────────────

interface ChatLine {
  type: "user" | "character" | "narration" | "divider" | "system";
  characterName?: string;
  charDir?: string;
  imageKey?: string;
  text: string;
}
interface ChatGroup {
  type: "user" | "character" | "narration" | "divider" | "system";
  characterName?: string;
  charDir?: string;
  imageKey?: string;
  lines: string[];
}
interface NameMapEntry {
  dir: string;
  avatarImage: string;
  color?: string;
}
interface RpgStatus {
  hp: { current: number; max: number };
  mp: { current: number; max: number };
  emotion?: string;
  location?: string;
  conditions: string[];
}
interface InventoryItem {
  slug: string;
  name: string;
  qty?: number;
  note?: string;
}
interface QuestEntry {
  id: string;
  status: "active" | "done";
  title: string;
  note?: string;
}
interface RpgStats {
  "힘": number;
  "민첩": number;
  "통찰": number;
  "화술": number;
}
type StatKey = keyof RpgStats;
const STAT_KEYS: readonly StatKey[] = ["힘", "민첩", "통찰", "화술"];

interface ChoiceOption {
  label: string;
  action: string;
  stat?: string;
  dc?: number;
}

// ── Name map ────────────────────────────────────────────────────────────────

function buildNameMap(files: ProjectFile[]): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const file of files) {
    if (file.type !== "text" || !file.frontmatter) continue;
    const fm = file.frontmatter;
    if (!fm["avatar-image"]) continue;
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    const entry: NameMapEntry = {
      dir,
      avatarImage: String(fm["avatar-image"]),
      color: fm.color ? String(fm.color) : undefined,
    };
    if (fm.names) {
      for (const raw of String(fm.names).split(",")) {
        const name = raw.trim();
        if (name && !map.has(name)) map.set(name, entry);
      }
    }
    const dn = fm["display-name"];
    if (dn && !map.has(String(dn))) map.set(String(dn), entry);
    if (fm.name && !map.has(String(fm.name))) map.set(String(fm.name), entry);
  }
  return map;
}

function resolveAvatar(
  line: ChatLine,
  nameMap: Map<string, NameMapEntry>,
): ChatLine {
  if (line.type !== "character" || line.charDir) return line;
  const entry = nameMap.get(line.characterName!);
  if (!entry) return line;
  return { ...line, charDir: entry.dir, imageKey: entry.avatarImage };
}

// ── YAML readers ────────────────────────────────────────────────────────────

function findDataFile(files: ProjectFile[], path: string): DataFile | null {
  const file = files.find(
    (f): f is DataFile => f.type === "data" && f.path === path,
  );
  return file ?? null;
}
function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStatusYaml(files: ProjectFile[]): RpgStatus | null {
  const file = findDataFile(files, "status.yaml");
  if (!file) return null;
  const root = asObject(file.data);
  if (!root) return null;
  const hpObj = asObject(root.hp) ?? {};
  const mpObj = asObject(root.mp) ?? {};
  const conditionsRaw = Array.isArray(root.conditions) ? root.conditions : [];
  return {
    hp: { current: asNumber(hpObj.current, 0), max: asNumber(hpObj.max, 0) },
    mp: { current: asNumber(mpObj.current, 0), max: asNumber(mpObj.max, 0) },
    emotion: asString(root.emotion),
    location: asString(root.location),
    conditions: conditionsRaw
      .map((c) => (typeof c === "string" ? c : null))
      .filter((c): c is string => c !== null && c.length > 0),
  };
}
function readInventoryYaml(files: ProjectFile[]): InventoryItem[] {
  const file = findDataFile(files, "inventory.yaml");
  if (!file) return [];
  const root = asObject(file.data);
  if (!root) return [];
  const items = Array.isArray(root.items) ? root.items : [];
  const out: InventoryItem[] = [];
  for (const raw of items) {
    const obj = asObject(raw);
    if (!obj) continue;
    const slug = asString(obj.slug) ?? "";
    const name = asString(obj.name) ?? slug;
    if (!name) continue;
    const item: InventoryItem = { slug, name };
    if (typeof obj.qty === "number") item.qty = obj.qty;
    const note = asString(obj.note);
    if (note) item.note = note;
    out.push(item);
  }
  return out;
}
function readStatsYaml(files: ProjectFile[]): RpgStats | null {
  const file = findDataFile(files, "stats.yaml");
  if (!file) return null;
  const root = asObject(file.data);
  if (!root) return null;
  return {
    "힘": asNumber(root["힘"], 0),
    "민첩": asNumber(root["민첩"], 0),
    "통찰": asNumber(root["통찰"], 0),
    "화술": asNumber(root["화술"], 0),
  };
}
function readQuestYaml(files: ProjectFile[]): QuestEntry[] {
  const file = findDataFile(files, "quest.yaml");
  if (!file) return [];
  const root = asObject(file.data);
  if (!root) return [];
  const quests = Array.isArray(root.quests) ? root.quests : [];
  const out: QuestEntry[] = [];
  for (const raw of quests) {
    const obj = asObject(raw);
    if (!obj) continue;
    const id = asString(obj.id) ?? "";
    const title = asString(obj.title) ?? id;
    if (!title) continue;
    const status = obj.status === "done" ? "done" : "active";
    const entry: QuestEntry = { id, status, title };
    const note = asString(obj.note);
    if (note) entry.note = note;
    out.push(entry);
  }
  return out;
}

// ── [CHOICES] marker parser ─────────────────────────────────────────────────

function parseChoicesMarker(content: string): ChoiceOption[] {
  const blocks = [
    ...content.matchAll(/\[CHOICES\]\n([\s\S]*?)\n?\[\/CHOICES\]/g),
  ];
  if (blocks.length === 0) return [];
  const last = blocks[blocks.length - 1];
  const body = last && last[1] ? last[1] : "";

  const options: ChoiceOption[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/^\s*-\s*/, "").trim();
    if (!line) continue;
    const fields: Record<string, string> = {};
    for (const part of line.split("|")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key) fields[key] = value;
    }
    const label = fields.label;
    const action = fields.action;
    if (!label || !action) continue;
    const opt: ChoiceOption = { label, action };
    if (fields.stat) opt.stat = fields.stat;
    if (fields.dc) {
      const dcNum = parseInt(fields.dc, 10);
      if (Number.isFinite(dcNum)) opt.dc = dcNum;
    }
    options.push(opt);
  }
  return options;
}

function stripRpgBlocks(content: string): string {
  return content
    .replace(/\[CHOICES\]\n[\s\S]*?\n?\[\/CHOICES\]\n?/g, "")
    .replace(/\[STATUS\]\n[\s\S]*?\n?\[\/STATUS\]\n?/g, "")
    .replace(/\[INVENTORY\]\n[\s\S]*?\n?\[\/INVENTORY\]\n?/g, "")
    .replace(/\[QUEST\]\n[\s\S]*?\n?\[\/QUEST\]\n?/g, "");
}

// ── Line parsing ────────────────────────────────────────────────────────────

const IMAGE_TOKEN_PREFIX = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*/;
const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;
const PLATE_ONLY_RE = /^\[[a-z0-9][a-z0-9-]*:[^\]]+\]$/;

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };
  const systemMatch = trimmed.match(/^\[SYSTEM\]\s+(.+)$/);
  if (systemMatch) return { type: "system", text: systemMatch[1] };
  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };

  let rest = trimmed;
  let charDir: string | undefined;
  let imageKey: string | undefined;
  const tokenMatch = trimmed.match(IMAGE_TOKEN_PREFIX);
  if (tokenMatch) {
    charDir = tokenMatch[1];
    imageKey = tokenMatch[2];
    rest = trimmed.slice(tokenMatch[0].length);
  }
  const charMatch = rest.match(/^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/);
  if (charMatch)
    return {
      type: "character",
      characterName: charMatch[1],
      charDir,
      imageKey,
      text: charMatch[2],
    };
  const charFallback = rest.match(/^([^\s:*][^:]{0,40}):\s*(["*“].*)$/);
  if (charFallback)
    return {
      type: "character",
      characterName: charFallback[1],
      charDir,
      imageKey,
      text: charFallback[2],
    };
  return { type: "narration", text: trimmed };
}

function groupLines(lines: ChatLine[]): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const line of lines) {
    const prev = groups[groups.length - 1];
    if (line.type === "divider") {
      groups.push({ type: "divider", lines: [] });
      continue;
    }
    if (line.type === "system") {
      groups.push({ type: "system", lines: [line.text] });
      continue;
    }
    if (
      prev &&
      prev.type === line.type &&
      (line.type !== "character" ||
        (prev.characterName === line.characterName &&
          prev.imageKey === line.imageKey))
    ) {
      prev.lines.push(line.text);
    } else {
      groups.push({
        type: line.type,
        characterName: line.characterName,
        charDir: line.charDir,
        imageKey: line.imageKey,
        lines: [line.text],
      });
    }
  }
  return groups;
}

// ── Character visuals ──────────────────────────────────────────────────────

interface PortraitAppearance {
  color: string;
  src: string | null;
  alt: string;
}

function fallbackColor(name: string, map: Map<string, string>): string {
  if (map.has(name)) return map.get(name)!;
  const c = CHARACTER_COLORS[map.size % CHARACTER_COLORS.length];
  map.set(name, c);
  return c;
}

function resolvePortrait(
  charDir: string | undefined,
  imageKey: string | undefined,
  displayName: string,
  ctx: RenderCtx,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): PortraitAppearance {
  const entry = nameMap.get(displayName);
  const color = entry?.color || fallbackColor(displayName, fallbackColorMap);
  const resolvedDir = charDir ?? entry?.dir;
  if (resolvedDir && imageKey) {
    return {
      color,
      src: resolveImageUrl(ctx, resolvedDir, imageKey),
      alt: displayName,
    };
  }
  return { color, src: null, alt: displayName };
}

function Portrait({ appearance }: { appearance: PortraitAppearance }): ReactElement {
  const [errored, setErrored] = useState(false);
  const showFallback = !appearance.src || errored;
  return (
    <div className="lg-portrait" data-fallback={showFallback ? "1" : undefined}>
      <div className="lg-portrait-halo" />
      {appearance.src ? (
        <img
          className="lg-portrait-img"
          src={appearance.src}
          alt={appearance.alt}
          onError={() => setErrored(true)}
        />
      ) : null}
      <div className="lg-portrait-fallback" aria-hidden="true">?</div>
    </div>
  );
}

interface PersonaInfo {
  displayName: string;
  color: string;
  appearance: PortraitAppearance;
  body: string;
}

function resolvePersona(
  ctx: RenderCtx,
  nameMap: Map<string, NameMapEntry>,
): PersonaInfo | null {
  const personaFile = ctx.files.find(
    (f): f is TextFile =>
      f.type === "text" &&
      f.frontmatter?.role === "persona" &&
      !!f.frontmatter?.["display-name"],
  );
  if (!personaFile) return null;
  const fm = personaFile.frontmatter!;
  const displayName = String(fm["display-name"]);
  const dir = personaFile.path.substring(0, personaFile.path.lastIndexOf("/"));
  const imageKey = fm["avatar-image"] ? String(fm["avatar-image"]) : undefined;
  const isolated = new Map<string, string>();
  const app = resolvePortrait(dir, imageKey, displayName, ctx, nameMap, isolated);
  const color = fm.color ? String(fm.color) : app.color;
  return {
    displayName,
    color,
    appearance: { ...app, color },
    body: personaFile.content,
  };
}

// ── Polaroid (inline [slug:key]) ────────────────────────────────────────────

function Polaroid({
  slug,
  imageKey,
  ctx,
  nameMap,
}: {
  slug: string;
  imageKey: string;
  ctx: RenderCtx;
  nameMap: Map<string, NameMapEntry>;
}): ReactElement | null {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const entry = nameMap.get(slug);
  const dir = entry?.dir ?? slug;
  const url = resolveImageUrl(ctx, dir, imageKey);
  const tilt = (hashStr(slug + imageKey) % 5) - 2;
  const tag = `${slug} · ${imageKey.replace(/^assets\//, "")}`;
  return (
    <figure className="lg-plate" data-tilt={String(tilt)}>
      <div className="lg-plate-frame">
        <img
          className="lg-plate-img"
          src={url}
          alt={tag}
          onError={() => setHidden(true)}
        />
        <div className="lg-plate-gloss" />
      </div>
      <figcaption className="lg-plate-tag">{tag}</figcaption>
    </figure>
  );
}

// ── Inline formatting (smart quotes, **bold**, *italic*, [slug:key] polaroid) ─

function renderInlineText(
  text: string,
  ctx: RenderCtx,
  nameMap: Map<string, NameMapEntry>,
  keyPrefix: string,
): ReactNode[] {
  // First: split on inline image tokens so polaroids are standalone React nodes.
  const pieces: ReactNode[] = [];
  let cursor = 0;
  let idx = 0;
  INLINE_IMAGE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_IMAGE.exec(text)) !== null) {
    if (match.index > cursor) {
      pieces.push(
        ...formatTextSegment(
          text.slice(cursor, match.index),
          `${keyPrefix}-t${idx++}`,
        ),
      );
    }
    pieces.push(
      <Polaroid
        key={`${keyPrefix}-p${idx++}`}
        slug={match[1]!}
        imageKey={match[2]!}
        ctx={ctx}
        nameMap={nameMap}
      />,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    pieces.push(
      ...formatTextSegment(text.slice(cursor), `${keyPrefix}-t${idx++}`),
    );
  }
  return pieces;
}

// Apply smart-quotes, **bold**, *italic* to a plain text segment (no image tokens).
function formatTextSegment(text: string, keyPrefix: string): ReactNode[] {
  // Smart-quote transform first (preserved from original).
  const smart = text.replace(/"(.+?)"/g, "“$1”");
  // Split on **bold** and *italic* with combined regex.
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  const out: ReactNode[] = [];
  let cursor = 0;
  let idx = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(smart)) !== null) {
    if (match.index > cursor) out.push(smart.slice(cursor, match.index));
    if (match[1] !== undefined) {
      out.push(<strong key={`${keyPrefix}-b${idx++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-i${idx++}`} className="lg-action">
          {match[2]}
        </em>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < smart.length) out.push(smart.slice(cursor));
  return out;
}

// Join multiple formatted lines with soft break separators.
function renderGroupBody(
  lines: string[],
  ctx: RenderCtx,
  nameMap: Map<string, NameMapEntry>,
  keyPrefix: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      out.push(<span key={`${keyPrefix}-sb${i}`} className="lg-soft-break" />);
    }
    out.push(
      <span key={`${keyPrefix}-l${i}`}>
        {renderInlineText(l, ctx, nameMap, `${keyPrefix}-l${i}`)}
      </span>,
    );
  });
  return out;
}

// ── Persona body (mini markdown) ────────────────────────────────────────────

function renderPersonaBody(body: string): ReactElement[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: ReactElement[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let outKey = 0;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(<p key={`pg-${outKey++}`}>{paragraph.join(" ")}</p>);
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      out.push(
        <ul key={`ul-${outKey++}`}>
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushBullets();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      flushAll();
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      flushAll();
      out.push(<h6 key={`h6-${outKey++}`}>{h3[1] ?? ""}</h6>);
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flushAll();
      out.push(<h5 key={`h5-${outKey++}`}>{h2[1] ?? ""}</h5>);
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      flushAll();
      out.push(<h4 key={`h4-${outKey++}`}>{h1[1] ?? ""}</h4>);
      continue;
    }
    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1] ?? "");
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushAll();
  return out;
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
function lookupStatMod(stats: RpgStats | null, stat: string): number | null {
  if (!stats) return null;
  const match = STAT_KEYS.find((k) => k === stat);
  return match ? stats[match] : null;
}
function vigorTone(pct: number): { color: string; label: string } {
  if (pct > 0.66) return { color: VERDIGRIS, label: "VITAL" };
  if (pct > 0.33) return { color: ILLUMINATED_COPPER, label: "STRAINED" };
  return { color: VERMILION, label: "FAILING" };
}
function lastSegment(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}


// ── Log Header ─────────────────────────────────────────────────────────────

function LanternSvg(): ReactElement {
  return (
    <svg className="lg-lantern" viewBox="0 0 16 22" aria-hidden="true">
      <ellipse cx="8" cy="10" rx="5" ry="6" className="lg-lantern-glow" />
      <rect x="3.5" y="4" width="9" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="0.6" />
      <line x1="5" y1="4" x2="5" y2="16" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      <line x1="11" y1="4" x2="11" y2="16" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      <rect x="5.5" y="16" width="5" height="2" fill="none" stroke="currentColor" strokeWidth="0.5" />
    </svg>
  );
}

function VitalGauge({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}): ReactElement {
  const pct = Math.max(0, Math.min(1, max > 0 ? current / max : 0));
  const dashLen = 100;
  const filled = pct * dashLen;
  const rest = 100 - filled;
  return (
    <div className="lg-vital">
      <span className="lg-vital-label">{label}</span>
      <svg className="lg-vital-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="3" x2="100" y2="3" className="lg-vital-track" />
        <line
          x1="0"
          y1="3"
          x2="100"
          y2="3"
          className="lg-vital-fill"
          style={{ stroke: color, strokeDasharray: `${filled.toFixed(1)} ${rest.toFixed(1)}` }}
        />
      </svg>
      <span className="lg-vital-value" style={{ color }}>
        {current}
        <span className="lg-vital-slash">/</span>
        {max}
      </span>
    </div>
  );
}

function LogHeader({
  status,
  entryCode,
}: {
  status: RpgStatus | null;
  entryCode: string;
}): ReactElement {
  if (!status) {
    return (
      <header className="lg-header lg-header--empty">
        <div className="lg-header-brand">
          <LanternSvg />
          <span className="lg-header-title">The Cartographer&apos;s Log</span>
        </div>
        <span className="lg-header-stamp">LOG&nbsp;·&nbsp;{entryCode}</span>
      </header>
    );
  }
  const vigorColor = status.hp
    ? vigorTone(status.hp.current / Math.max(1, status.hp.max)).color
    : VERDIGRIS;
  return (
    <header className="lg-header">
      <div className="lg-header-row lg-header-row--top">
        <div className="lg-header-brand">
          <LanternSvg />
          <span className="lg-header-title">The Cartographer&apos;s Log</span>
        </div>
        <div className="lg-header-meta">
          {status.emotion ? (
            <span className="lg-emotion" aria-label="emotion">
              {status.emotion}
            </span>
          ) : null}
          {status.conditions.length > 0 ? (
            <span className="lg-effect">{status.conditions.join(" · ")}</span>
          ) : null}
          <span className="lg-header-stamp">LOG&nbsp;·&nbsp;{entryCode}</span>
        </div>
      </div>
      <div className="lg-header-row lg-header-row--bottom">
        {status.location ? (
          <div className="lg-bearing">
            <svg className="lg-bearing-mark" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
              <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="0.5" opacity="0.35" />
              <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="0.5" opacity="0.35" />
              <path d="M7 2 L8 7 L7 12 L6 7 Z" fill="currentColor" />
            </svg>
            <span className="lg-bearing-label">BEARING</span>
            <span className="lg-bearing-text">{status.location}</span>
          </div>
        ) : null}
        <div className="lg-vitals">
          {status.hp ? (
            <VitalGauge label="VIGOR" current={status.hp.current} max={status.hp.max} color={vigorColor} />
          ) : null}
          {status.mp ? (
            <VitalGauge label="ANIMA" current={status.mp.current} max={status.mp.max} color={VERDIGRIS} />
          ) : null}
        </div>
      </div>
    </header>
  );
}

// ── Appendix ───────────────────────────────────────────────────────────────

function PackManifest({ items }: { items: InventoryItem[] }): ReactElement | null {
  if (items.length === 0) return null;
  return (
    <details className="lg-appendix-section">
      <summary className="lg-appendix-head">
        <span className="lg-appendix-title" data-short="Pack">Pack Manifest</span>
        <span className="lg-appendix-count">
          {items.length.toString().padStart(2, "0")}
        </span>
        <span className="lg-appendix-chevron" aria-hidden="true" />
      </summary>
      <ul className="lg-item-list">
        {items.map((item, i) => (
          <li key={i} className="lg-item lg-item--kept">
            <span className="lg-item-glyph">·</span>
            <span className="lg-item-name">{item.name}</span>
            {typeof item.qty === "number" && item.qty > 1 ? (
              <span className="lg-item-qty">×{item.qty}</span>
            ) : null}
            {item.note ? <span className="lg-item-desc">— {item.note}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function StandingCharts({ quests }: { quests: QuestEntry[] }): ReactElement | null {
  if (quests.length === 0) return null;
  const openCount = quests.filter((q) => q.status !== "done").length;
  return (
    <details className="lg-appendix-section">
      <summary className="lg-appendix-head">
        <span className="lg-appendix-title" data-short="Charts">Standing Charts</span>
        <span className="lg-appendix-count">
          {openCount.toString().padStart(2, "0")}
        </span>
        <span className="lg-appendix-chevron" aria-hidden="true" />
      </summary>
      <ul className="lg-quest-list">
        {quests.map((q, i) => {
          const cls =
            q.status === "done"
              ? "lg-quest lg-quest--closed"
              : "lg-quest lg-quest--pursuing";
          return (
            <li key={i} className={cls}>
              {q.status === "done" ? (
                <span className="lg-quest-glyph">✓</span>
              ) : (
                <span className="lg-quest-glyph" style={{ color: ILLUMINATED_COPPER }}>∽</span>
              )}
              <span className="lg-quest-name">{q.title}</span>
              {q.note ? <span className="lg-quest-desc">— {q.note}</span> : null}
              {q.status === "done" ? (
                <span className="lg-quest-flag lg-quest-flag--closed">closed</span>
              ) : (
                <span className="lg-quest-flag">in pursuit</span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function AbilityScores({ stats }: { stats: RpgStats | null }): ReactElement | null {
  if (!stats) return null;
  return (
    <details className="lg-appendix-section" open>
      <summary className="lg-appendix-head">
        <span className="lg-appendix-title" data-short="Scores">Ability Scores</span>
        <span className="lg-appendix-count">4</span>
        <span className="lg-appendix-chevron" aria-hidden="true" />
      </summary>
      <ul className="lg-ability-list">
        {STAT_KEYS.map((key) => {
          const value = stats[key];
          const tone =
            value >= 3 ? "lg-ability--strong" : value <= -1 ? "lg-ability--weak" : "";
          return (
            <li key={key} className={`lg-ability ${tone}`}>
              <span className="lg-ability-ko">{key}</span>
              <span className="lg-ability-mod">{formatMod(value)}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Appendix({
  items,
  quests,
  stats,
}: {
  items: InventoryItem[];
  quests: QuestEntry[];
  stats: RpgStats | null;
}): ReactElement | null {
  if (!stats && items.length === 0 && quests.length === 0) return null;
  return (
    <footer className="lg-appendix">
      <AbilityScores stats={stats} />
      <PackManifest items={items} />
      <StandingCharts quests={quests} />
    </footer>
  );
}

// ── Passage Papers (persona) ───────────────────────────────────────────────

function PassageBar({ persona }: { persona: PersonaInfo | null }): ReactElement | null {
  if (!persona) return null;
  const body = renderPersonaBody(persona.body);
  if (body.length === 0) return null;
  return (
    <details className="lg-passage" style={{ ["--c" as any]: persona.color }}>
      <summary className="lg-passage-strip">
        <span className="lg-passage-seal" aria-hidden="true">
          <span className="lg-passage-seal-avatar">
            <Portrait appearance={persona.appearance} />
          </span>
        </span>
        <span className="lg-passage-label">PASSAGE&nbsp;PAPERS</span>
        <span className="lg-passage-divider" aria-hidden="true" />
        <span className="lg-passage-name">{persona.displayName}</span>
        <span className="lg-passage-hint">
          <span className="lg-passage-hint-text">DOSSIER</span>
          <span className="lg-passage-hint-text lg-passage-hint-text--open">접기</span>
          <span className="lg-passage-chevron" aria-hidden="true" />
        </span>
      </summary>
      <div className="lg-passage-drawer" role="region" aria-label="Passage papers dossier">
        <div className="lg-passage-card">
          <div className="lg-passage-meridian" aria-hidden="true">
            <span className="lg-passage-meridian-mark">✦</span>
          </div>
          <div className="lg-passage-corner lg-passage-corner--tl" aria-hidden="true" />
          <div className="lg-passage-corner lg-passage-corner--tr" aria-hidden="true" />
          <div className="lg-passage-corner lg-passage-corner--bl" aria-hidden="true" />
          <div className="lg-passage-corner lg-passage-corner--br" aria-hidden="true" />
          <header className="lg-passage-head">
            <div className="lg-passage-portrait">
              <Portrait appearance={persona.appearance} />
            </div>
            <div className="lg-passage-title">
              <span className="lg-passage-eyebrow">Archivist&apos;s Dossier</span>
              <h3 className="lg-passage-display">{persona.displayName}</h3>
              <span className="lg-passage-rule" />
            </div>
            <span className="lg-passage-stamp" aria-hidden="true">
              <span className="lg-passage-stamp-top">FILED</span>
              <span className="lg-passage-stamp-mid">⛆</span>
              <span className="lg-passage-stamp-bot">UNDER LOG</span>
            </span>
          </header>
          <div className="lg-passage-body">{body}</div>
        </div>
      </div>
    </details>
  );
}

// ── Next Choices ───────────────────────────────────────────────────────────

function NextChoices({
  options,
  stats,
  onFill,
}: {
  options: ChoiceOption[];
  stats: RpgStats | null;
  onFill: (text: string) => void;
}): ReactElement | null {
  if (options.length === 0) return null;
  return (
    <div className="lg-choice" role="group" aria-label="다음 행동">
      <div className="lg-choice-head">
        <span className="lg-choice-glyph" aria-hidden="true">❖</span>
        <span className="lg-choice-title">다음 행동</span>
        <span className="lg-choice-hint">
          버튼을 누르면 입력창에 채워집니다. 자유 입력도 가능합니다.
        </span>
      </div>
      <div className="lg-choice-list">
        {options.map((opt, i) => {
          const mod = opt.stat ? lookupStatMod(stats, opt.stat) : null;
          const statText = opt.stat
            ? mod !== null
              ? `${opt.stat} ${formatMod(mod)}`
              : opt.stat
            : "";
          const showMeta = !!statText || typeof opt.dc === "number";
          return (
            <button
              key={i}
              type="button"
              className="lg-choice-option"
              style={{ ["--i" as any]: i }}
              onClick={() => onFill(opt.action)}
            >
              <span className="lg-choice-label">{opt.label}</span>
              {showMeta ? (
                <span className="lg-choice-meta">
                  {statText ? <span className="lg-choice-stat">{statText}</span> : null}
                  {typeof opt.dc === "number" ? (
                    <span className="lg-choice-dc">DC {opt.dc}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Beat renderers ─────────────────────────────────────────────────────────

function CharacterBeat({
  group,
  ctx,
  nameMap,
  fallbackColorMap,
  id,
}: {
  group: ChatGroup;
  ctx: RenderCtx;
  nameMap: Map<string, NameMapEntry>;
  fallbackColorMap: Map<string, string>;
  id: string;
}): ReactElement {
  const name = group.characterName!;
  const appearance = resolvePortrait(
    group.charDir,
    group.imageKey,
    name,
    ctx,
    nameMap,
    fallbackColorMap,
  );
  return (
    <section
      id={id}
      className="lg-plate-dialogue"
      style={{ ["--c" as any]: appearance.color }}
    >
      <div className="lg-plate-portrait">
        <Portrait appearance={appearance} />
      </div>
      <div className="lg-plate-caption">
        <header className="lg-nameplate">
          <span className="lg-nameplate-mark" />
          <span className="lg-nameplate-name">{name}</span>
        </header>
        <div className="lg-plate-body">
          {renderGroupBody(group.lines, ctx, nameMap, id)}
        </div>
      </div>
    </section>
  );
}

function UserBeat({
  lines,
  ctx,
  nameMap,
  persona,
  id,
}: {
  lines: string[];
  ctx: RenderCtx;
  nameMap: Map<string, NameMapEntry>;
  persona: PersonaInfo | null;
  id: string;
}): ReactElement {
  const label = persona ? persona.displayName : "";
  return (
    <aside id={id} className="lg-whisper">
      <div className="lg-whisper-body">
        {renderGroupBody(lines, ctx, nameMap, id)}
      </div>
      {label ? <div className="lg-whisper-hand">— {label}</div> : null}
    </aside>
  );
}

function NarrationBeat({
  lines,
  ctx,
  nameMap,
  id,
}: {
  lines: string[];
  ctx: RenderCtx;
  nameMap: Map<string, NameMapEntry>;
  id: string;
}): ReactElement {
  if (lines.length === 1 && PLATE_ONLY_RE.test(lines[0].trim())) {
    return (
      <div id={id} className="lg-plate-solo">
        {renderInlineText(lines[0], ctx, nameMap, id)}
      </div>
    );
  }
  return (
    <div id={id} className="lg-narration">
      <span className="lg-narration-rule" />
      <span className="lg-narration-text">
        {renderGroupBody(lines, ctx, nameMap, id)}
      </span>
      <span className="lg-narration-rule" />
    </div>
  );
}

function SystemBeat({ text, id }: { text: string; id: string }): ReactElement {
  return (
    <div id={id} className="lg-stamp-wrap">
      <div className="lg-stamp">
        <span className="lg-stamp-glyph" aria-hidden="true">✦</span>
        <span className="lg-stamp-text">{text}</span>
      </div>
    </div>
  );
}

function DividerBeat({ id }: { id: string }): ReactElement {
  return (
    <div id={id} className="lg-divider" role="separator">
      <span className="lg-divider-rule" />
      <svg className="lg-rose" viewBox="0 0 40 40" aria-hidden="true">
        <g className="lg-rose-spin">
          <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.35" />
          <path d="M20 4 L22 20 L20 36 L18 20 Z" fill="currentColor" opacity="0.85" />
          <path d="M4 20 L20 18 L36 20 L20 22 Z" fill="currentColor" opacity="0.65" />
          <path d="M8.5 8.5 L21 19 L31.5 31.5 L19 21 Z" fill="currentColor" opacity="0.4" />
          <path d="M31.5 8.5 L21 21 L8.5 31.5 L19 19 Z" fill="currentColor" opacity="0.4" />
          <circle cx="20" cy="20" r="1.5" fill="currentColor" />
        </g>
      </svg>
      <span className="lg-divider-rule" />
    </div>
  );
}

function Beats({
  groups,
  ctx,
  nameMap,
  fallbackColorMap,
  persona,
}: {
  groups: ChatGroup[];
  ctx: RenderCtx;
  nameMap: Map<string, NameMapEntry>;
  fallbackColorMap: Map<string, string>;
  persona: PersonaInfo | null;
}): ReactElement {
  return (
    <>
      {groups.map((g, i) => {
        const id = `lg-b-${i}`;
        switch (g.type) {
          case "user":
            return <UserBeat key={id} lines={g.lines} ctx={ctx} nameMap={nameMap} persona={persona} id={id} />;
          case "character":
            return (
              <CharacterBeat
                key={id}
                group={g}
                ctx={ctx}
                nameMap={nameMap}
                fallbackColorMap={fallbackColorMap}
                id={id}
              />
            );
          case "narration":
            return <NarrationBeat key={id} lines={g.lines} ctx={ctx} nameMap={nameMap} id={id} />;
          case "divider":
            return <DividerBeat key={id} id={id} />;
          case "system":
            return <SystemBeat key={id} text={g.lines[0] ?? ""} id={id} />;
        }
      })}
    </>
  );
}

// ── Ritual (streaming feedback) ─────────────────────────────────────────────

const RITUAL_NARRATION: Record<"peace" | "combat", Record<string, string>> = {
  peace: {
    thinking: "필경사의 깃펜이 떠오른다",
    script: "오라클이 주사위를 흔든다",
    read: "낡은 책장이 펼쳐진다",
    grep: "돋보기가 양피지를 훑는다",
    write: "서기관이 인장을 찍는다",
    append: "필사가가 다음 행을 잇는다",
    edit: "잉크를 지워 다시 새긴다",
    tree: "나침반이 방위를 돌린다",
    activate_skill: "비의서의 인장이 빛을 낸다",
  },
  combat: {
    thinking: "촛불 아래 호흡이 가라앉는다",
    script: "피 묻은 주사위가 던져진다",
    read: "오래된 서약서가 풀린다",
    grep: "횃불로 어둠을 훑는다",
    write: "검은 잉크가 새겨진다",
    append: "맹세에 새 행이 더해진다",
    edit: "맹세가 고쳐 쓰인다",
    tree: "어둠 속 지도가 펼쳐진다",
    activate_skill: "인장이 핏빛으로 달아오른다",
  },
};

function ritualNarration(mode: "peace" | "combat", tool: string): string {
  const map = RITUAL_NARRATION[mode];
  return map[tool] ?? map.thinking ?? "";
}

function ritualArgLabel(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  switch (toolName) {
    case "read": {
      const path = a.path;
      return typeof path === "string" ? lastSegment(path) : "";
    }
    case "grep": {
      const p = a.pattern;
      if (typeof p !== "string") return "";
      return p.length > 28 ? p.slice(0, 28) + "…" : p;
    }
    case "write":
    case "edit":
    case "append": {
      const fp = a.file_path ?? a.path;
      return typeof fp === "string" ? lastSegment(fp) : "";
    }
    case "tree": {
      const path = a.path;
      return typeof path === "string" ? path : "";
    }
    case "activate_skill": {
      const sn = a.skill_name ?? a.name;
      return typeof sn === "string" ? sn : "";
    }
    case "script": {
      const inner = a.args;
      if (Array.isArray(inner) && typeof inner[0] === "string") return inner[0];
      const file = a.file;
      if (typeof file === "string") return lastSegment(file);
      return "";
    }
    default:
      return "";
  }
}

interface DiceParse {
  expr: string;
  count: number;
  sides: number;
  mod: number;
  keep: number | null;
  dc: number | null;
}
interface DiceResult {
  rolls: number[];
  total: number;
  dc: number | null;
  passed: boolean | null;
  margin: number | null;
}

function parseDiceArgs(args: unknown): DiceParse | null {
  if (!args || typeof args !== "object") return null;
  const a = (args as Record<string, unknown>).args;
  if (!Array.isArray(a) || typeof a[0] !== "string") return null;
  const expr = a[0];
  const m = expr
    .toLowerCase()
    .trim()
    .match(/^(\d*)d(\d+)(?:kh(\d+))?(?:([+-])(\d+))?$/);
  if (!m) return null;
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2] ?? "0", 10);
  const keep = m[3] ? parseInt(m[3], 10) : null;
  const sign = m[4] === "-" ? -1 : 1;
  const mod = m[5] ? sign * parseInt(m[5], 10) : 0;
  const dcRaw = a[1];
  const dc =
    typeof dcRaw === "string" && /^\d+$/.test(dcRaw)
      ? parseInt(dcRaw, 10)
      : typeof dcRaw === "number"
        ? dcRaw
        : null;
  return { expr, count, sides, mod, keep, dc };
}

function parseDiceResult(content: ToolResultContent | undefined): DiceResult | null {
  if (!content) return null;
  const text = content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  if (!text) return null;

  let rolls: number[] = [];
  const kept = text.match(/^Kept: \[([^\]]+)\]/m);
  const multi = text.match(/^Rolls: \[([^\]]+)\]/m);
  const single = text.match(/^Roll: (-?\d+)/m);
  if (kept) {
    rolls = (kept[1] ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
  } else if (multi) {
    rolls = (multi[1] ?? "")
      .split(",")
      .map((s) => parseInt(s.trim().replace(/^~|~$/g, ""), 10))
      .filter((n) => !Number.isNaN(n));
  } else if (single && single[1]) {
    rolls = [parseInt(single[1], 10)];
  } else {
    return null;
  }

  const totalMatch = text.match(/^Total: -?\d+ [+-]\d+ = (-?\d+)/m);
  const total = totalMatch
    ? parseInt(totalMatch[1] ?? "0", 10)
    : rolls.reduce((a, b) => a + b, 0);

  const dcMatch = text.match(/^DC (\d+): (PASS|FAIL) \(margin ([+-]?\d+)\)/m);
  if (dcMatch) {
    return {
      rolls,
      total,
      dc: parseInt(dcMatch[1] ?? "0", 10),
      passed: dcMatch[2] === "PASS",
      margin: parseInt(dcMatch[3] ?? "0", 10),
    };
  }
  return { rolls, total, dc: null, passed: null, margin: null };
}

function Die({
  index,
  total,
  face,
  settled,
}: {
  index: number;
  total: number;
  face: string;
  settled: boolean;
}): ReactElement {
  const spacing = total <= 2 ? 64 : total === 3 ? 60 : total === 4 ? 52 : 46;
  const centerX = 150;
  const x = centerX + (index - (total - 1) / 2) * spacing;
  const stagger = (index % 3) * 0.08;
  return (
    <g
      className="rdie"
      transform={`translate(${x.toFixed(1)} 68)`}
      data-settled={settled ? "1" : "0"}
      style={{
        ["--ddur" as any]: `${(0.85 + stagger).toFixed(2)}s`,
        ["--ddly" as any]: `-${stagger.toFixed(2)}s`,
      }}
    >
      <g className="rdie-spin">
        <rect className="rdie-face" x="-22" y="-22" width="44" height="44" rx="7" />
        <text className="rdie-text" x="0" y="1" textAnchor="middle" dominantBaseline="middle">
          {face}
        </text>
      </g>
    </g>
  );
}

function DiceCanvas({
  parse,
  result,
}: {
  parse: DiceParse | null;
  result: DiceResult | null;
}): ReactElement {
  const totalDice = parse?.count ?? 1;
  const visibleDice = Math.min(totalDice, 5);
  const overflow = totalDice - visibleDice;
  const settled = result !== null;
  const dies: ReactElement[] = [];
  for (let i = 0; i < visibleDice; i++) {
    const face = settled ? String(result!.rolls[i] ?? "?") : "?";
    dies.push(<Die key={`d-${i}`} index={i} total={visibleDice} face={face} settled={settled} />);
  }
  return (
    <>
      {parse?.dc != null ? (
        <g className="rdc-target" transform="translate(36 68)">
          <circle className="rdc-ring" cx="0" cy="0" r="22" />
          <circle className="rdc-ring rdc-ring-inner" cx="0" cy="0" r="14" />
          <text className="rdc-label" x="0" y="-28" textAnchor="middle">DC</text>
          <text className="rdc-value" x="0" y="5" textAnchor="middle">{parse.dc}</text>
        </g>
      ) : null}
      {parse && parse.mod !== 0 ? (
        <g className="rdc-mod" transform="translate(264 68)">
          <text className="rdc-mod-sign" x="0" y="-4" textAnchor="middle">
            {parse.mod > 0 ? "+" : "−"}
          </text>
          <text className="rdc-mod-value" x="0" y="22" textAnchor="middle">
            {Math.abs(parse.mod)}
          </text>
          <text className="rdc-mod-label" x="0" y="38" textAnchor="middle">MOD</text>
        </g>
      ) : null}
      {dies}
      {overflow > 0 ? (
        <text className="rdie-overflow" x="288" y="30" textAnchor="end">+{overflow}</text>
      ) : null}
    </>
  );
}

function DiceVerdict({
  parse,
  result,
}: {
  parse: DiceParse | null;
  result: DiceResult | null;
}): ReactElement | null {
  if (!parse || !result) return null;
  const { total, dc, passed, margin } = result;
  const marginStr =
    margin != null ? (margin >= 0 ? `+${margin}` : `${margin}`) : "";
  return (
    <div className="lg-dice-verdict" aria-hidden="true">
      <span className="lg-dice-total">{total}</span>
      {passed === true ? (
        <span className="lg-dice-stamp lg-dice-stamp--pass">
          <span className="lg-dice-stamp-word">PASS</span>
          <span className="lg-dice-stamp-dc">
            {dc != null ? `DC ${dc} · 차이 ${marginStr}` : ""}
          </span>
        </span>
      ) : passed === false ? (
        <span className="lg-dice-stamp lg-dice-stamp--fail">
          <span className="lg-dice-stamp-word">FAIL</span>
          <span className="lg-dice-stamp-dc">
            {dc != null ? `DC ${dc} · 차이 ${marginStr}` : ""}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function GenericScenes(): ReactElement {
  return (
    <>
      <g className="rscene rscene-thinking" aria-hidden="true">
        <ellipse cx="150" cy="120" rx="46" ry="8" className="rs-shadow" />
        <path className="rs-pot" d="M 112 80 L 112 116 Q 112 128 150 128 Q 188 128 188 116 L 188 80 Z" />
        <ellipse cx="150" cy="80" rx="38" ry="9" className="rs-pot-rim" />
        <ellipse cx="150" cy="82" rx="30" ry="6" className="rs-ink" />
        <circle cx="150" cy="82" r="10" className="rs-ripple rs-ripple-1" />
        <circle cx="150" cy="82" r="10" className="rs-ripple rs-ripple-2" />
        <circle cx="150" cy="82" r="10" className="rs-ripple rs-ripple-3" />
        <path className="rs-vapor rs-vapor-1" d="M 138 62 Q 132 46 150 36 Q 168 26 150 10" />
        <path className="rs-vapor rs-vapor-2" d="M 162 62 Q 168 48 155 40 Q 140 30 158 18" />
      </g>
      <g className="rscene rscene-read" aria-hidden="true">
        <path className="rs-page rs-page-l" d="M 154 30 L 50 34 L 54 118 L 150 114 Z" />
        <path className="rs-page rs-page-r" d="M 146 30 L 250 34 L 246 118 L 150 114 Z" />
        <path className="rs-spine" d="M 150 30 L 150 114" />
        <line className="rs-line rs-line-1" x1="62" y1="52" x2="136" y2="50" />
        <line className="rs-line rs-line-2" x1="62" y1="68" x2="134" y2="66" />
        <line className="rs-line rs-line-3" x1="62" y1="84" x2="132" y2="82" />
        <line className="rs-line rs-line-4" x1="62" y1="100" x2="130" y2="98" />
        <line className="rs-line rs-line-5" x1="164" y1="52" x2="238" y2="54" />
        <line className="rs-line rs-line-6" x1="164" y1="68" x2="236" y2="70" />
        <line className="rs-line rs-line-7" x1="164" y1="84" x2="234" y2="86" />
        <line className="rs-line rs-line-8" x1="164" y1="100" x2="232" y2="102" />
      </g>
      <g className="rscene rscene-grep" aria-hidden="true">
        <line className="rs-grep-line rs-grep-line-1" x1="32" y1="44" x2="268" y2="44" />
        <line className="rs-grep-line rs-grep-line-2" x1="32" y1="70" x2="268" y2="70" />
        <line className="rs-grep-line rs-grep-line-3" x1="32" y1="96" x2="268" y2="96" />
        <circle className="rs-grep-hit rs-grep-hit-1" cx="68" cy="44" r="3" />
        <circle className="rs-grep-hit rs-grep-hit-2" cx="168" cy="70" r="3" />
        <circle className="rs-grep-hit rs-grep-hit-3" cx="228" cy="96" r="3" />
        <g className="rs-lens">
          <circle className="rs-lens-ring" cx="0" cy="0" r="22" />
          <circle className="rs-lens-glass" cx="0" cy="0" r="18" />
          <line className="rs-lens-handle" x1="16" y1="16" x2="30" y2="30" />
        </g>
      </g>
      <g className="rscene rscene-write" aria-hidden="true">
        <rect className="rs-parchment" x="36" y="40" width="228" height="82" rx="4" />
        <line className="rs-write-line rs-write-line-1" x1="52" y1="60" x2="220" y2="60" />
        <line className="rs-write-line rs-write-line-2" x1="52" y1="80" x2="200" y2="80" />
        <line className="rs-write-line rs-write-line-3" x1="52" y1="100" x2="170" y2="100" />
        <g className="rs-quill">
          <path className="rs-quill-feather" d="M 232 6 Q 262 30 252 78 Q 244 86 236 78 Q 228 50 220 20 Z" />
          <line className="rs-quill-shaft" x1="240" y1="60" x2="202" y2="96" />
          <circle className="rs-quill-tip" cx="202" cy="96" r="2.6" />
          <circle className="rs-quill-drop" cx="202" cy="106" r="2.2" />
        </g>
      </g>
      <g className="rscene rscene-append" aria-hidden="true">
        <path className="rs-parchment rs-append-paper" d="M 36 30 L 248 30 L 264 46 L 264 118 L 36 118 Z" />
        <path className="rs-append-fold" d="M 248 30 L 264 46 L 248 46 Z" />
        <line className="rs-append-old rs-append-old-1" x1="50" y1="46" x2="210" y2="46" />
        <line className="rs-append-old rs-append-old-2" x1="50" y1="58" x2="222" y2="58" />
        <line className="rs-append-old rs-append-old-3" x1="50" y1="70" x2="196" y2="70" />
        <line className="rs-append-old rs-append-old-4" x1="50" y1="82" x2="218" y2="82" />
        <line className="rs-append-old rs-append-old-5" x1="50" y1="94" x2="184" y2="94" />
        <path className="rs-append-caret" d="M 44 104 L 48 108 L 44 112" />
        <circle className="rs-append-drop" cx="56" cy="100" r="2" />
        <line className="rs-append-new" x1="50" y1="108" x2="208" y2="108" />
      </g>
      <g className="rscene rscene-edit" aria-hidden="true">
        <rect className="rs-parchment" x="36" y="30" width="228" height="90" rx="4" />
        <line className="rs-edit-line rs-edit-old-1" x1="52" y1="52" x2="216" y2="52" />
        <line className="rs-edit-line rs-edit-old-2" x1="52" y1="76" x2="190" y2="76" />
        <line className="rs-edit-line rs-edit-new" x1="52" y1="102" x2="244" y2="102" />
        <line className="rs-edit-strike rs-edit-strike-1" x1="52" y1="52" x2="216" y2="52" />
      </g>
      <g className="rscene rscene-tree" aria-hidden="true">
        <g className="rs-compass">
          <circle className="rs-compass-ring" cx="150" cy="70" r="54" />
          <circle className="rs-compass-inner" cx="150" cy="70" r="40" />
          <circle className="rs-compass-inner rs-compass-inner-2" cx="150" cy="70" r="26" />
          <path className="rs-compass-rose" d="M 150 20 L 156 70 L 150 120 L 144 70 Z M 100 70 L 150 76 L 200 70 L 150 64 Z" />
          <text className="rs-compass-mark" x="150" y="18" textAnchor="middle">N</text>
          <text className="rs-compass-mark" x="210" y="73" textAnchor="middle">E</text>
          <text className="rs-compass-mark" x="150" y="132" textAnchor="middle">S</text>
          <text className="rs-compass-mark" x="90" y="73" textAnchor="middle">W</text>
        </g>
        <g className="rs-needle">
          <path d="M 150 28 L 154 70 L 150 112 L 146 70 Z" className="rs-needle-shape" />
        </g>
        <circle cx="150" cy="70" r="4" className="rs-compass-pivot" />
      </g>
      <g className="rscene rscene-activate_skill" aria-hidden="true">
        <circle className="rs-sigil-outer" cx="150" cy="70" r="56" />
        <circle className="rs-sigil-inner" cx="150" cy="70" r="40" />
        <circle className="rs-sigil-inner rs-sigil-inner-2" cx="150" cy="70" r="26" />
        <path className="rs-sigil-star" d="M 150 22 L 178 110 L 106 58 L 194 58 L 122 110 Z" />
        <circle className="rs-sigil-core" cx="150" cy="70" r="5" />
      </g>
    </>
  );
}

function RitualCanvas({
  toolKey,
  argLabel,
  parse,
  result,
}: {
  toolKey: string;
  argLabel: string;
  parse: DiceParse | null;
  result: DiceResult | null;
}): ReactElement {
  return (
    <div className="lg-ritual-stage">
      <svg
        className="lg-ritual-svg"
        viewBox="0 0 300 140"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <GenericScenes />
        {toolKey === "script" ? (
          <g className="rscene rscene-script" aria-hidden="true">
            <DiceCanvas parse={parse} result={result} />
          </g>
        ) : null}
      </svg>
      {argLabel ? <span className="lg-ritual-arg">{argLabel}</span> : null}
      {toolKey === "script" ? <DiceVerdict parse={parse} result={result} /> : null}
    </div>
  );
}

function activeToolCalls(state: AgentState): ToolCall[] {
  const content = state.streamingMessage?.content ?? [];
  return content.filter((b): b is ToolCall => b.type === "toolCall");
}

function findToolResult(state: AgentState, toolCallId: string): ToolResultMessage | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m && m.role === "toolResult" && m.toolCallId === toolCallId) return m;
  }
  return null;
}

function SealChain({
  state,
  toolCalls,
}: {
  state: AgentState;
  toolCalls: ReadonlyArray<ToolCall>;
}): ReactElement | null {
  if (toolCalls.length === 0) return null;
  const max = 8;
  const visible = toolCalls.slice(-max);
  const overflow = toolCalls.length - visible.length;
  return (
    <div className="lg-ritual-chain" aria-hidden="true">
      {visible.map((tc, i) => {
        const result = findToolResult(state, tc.id);
        if (!result) {
          return <span key={i} className="lg-seal lg-seal--live" title={tc.name} aria-hidden="true" />;
        }
        const cls = result.isError ? "lg-seal--err" : "lg-seal--done";
        return <span key={i} className={`lg-seal ${cls}`} title={tc.name} aria-hidden="true" />;
      })}
      {overflow > 0 ? <span className="lg-seal-more">+{overflow}</span> : null}
    </div>
  );
}

function PendingCard({
  state,
  mode,
}: {
  state: AgentState;
  mode: "peace" | "combat";
}): ReactElement {
  const tools = activeToolCalls(state);
  const latest = tools.length > 0 ? tools[tools.length - 1] : undefined;
  const inFlight = tools.find((tc) => !findToolResult(state, tc.id));
  const focus = inFlight ?? latest;
  const toolKey = focus?.name ?? "thinking";
  const focusResult = focus ? findToolResult(state, focus.id) : null;
  const stateAttr = focus ? (focusResult ? "settled" : "busy") : "thinking";

  const diceParse = toolKey === "script" ? parseDiceArgs(focus?.arguments) : null;
  const diceResult =
    toolKey === "script" ? parseDiceResult(focusResult?.content) : null;

  const narration = ritualNarration(mode, toolKey);
  const argLabel = focus ? ritualArgLabel(focus.name, focus.arguments) : "";

  const hiddenProps = state.isStreaming
    ? {}
    : { hidden: true, "aria-hidden": "true" as const };

  return (
    <aside
      id="lg-pending"
      className="lg-ritual"
      data-mode={mode}
      data-tool={toolKey}
      data-state={stateAttr}
      role="status"
      aria-live="polite"
      {...hiddenProps}
    >
      <header className="lg-ritual-head">
        <span className="lg-ritual-name">{narration}</span>
      </header>
      <RitualCanvas toolKey={toolKey} argLabel={argLabel} parse={diceParse} result={diceResult} />
      <SealChain state={state} toolCalls={tools} />
      <span className="lg-ritual-mote lg-ritual-mote-1" aria-hidden="true" />
      <span className="lg-ritual-mote lg-ritual-mote-2" aria-hidden="true" />
      <span className="lg-ritual-mote lg-ritual-mote-3" aria-hidden="true" />
      <span className="lg-ritual-mote lg-ritual-mote-4" aria-hidden="true" />
      <span className="lg-ritual-mote lg-ritual-mote-5" aria-hidden="true" />
      <span className="lg-ritual-mote lg-ritual-mote-6" aria-hidden="true" />
    </aside>
  );
}

// ── Empty state: Character Builder ──────────────────────────────────────────

const BUILDER_TOTAL = 6;
const BUILDER_MIN = -1;
const BUILDER_MAX = 5;

function CharacterBuilder({ onSend }: { onSend: (text: string) => void }): ReactElement {
  const [stats, setStats] = useState<Record<StatKey, number>>({
    "힘": 0,
    "민첩": 0,
    "통찰": 0,
    "화술": 0,
  });
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 값 변경 시 `lg-customs-value--bump` 애니메이션을 다시 트리거하기 위한
  // 스탯별 카운터. key에 섞어 span을 재마운트시켜 CSS keyframes를 재시작한다.
  const [bumps, setBumps] = useState<Record<StatKey, number>>({
    "힘": 0,
    "민첩": 0,
    "통찰": 0,
    "화술": 0,
  });

  const total = STAT_KEYS.reduce((a, k) => a + stats[k], 0);
  const totalState = total === BUILDER_TOTAL ? "ok" : total > BUILDER_TOTAL ? "over" : "under";
  const nameValid = name.trim().length > 0;
  const valid = total === BUILDER_TOTAL && nameValid;

  const step = (key: StatKey, delta: number) => {
    const cur = stats[key];
    const next = cur + delta;
    if (next < BUILDER_MIN || next > BUILDER_MAX) return;
    if (delta > 0 && total >= BUILDER_TOTAL) return;
    setStats({ ...stats, [key]: next });
    setBumps({ ...bumps, [key]: bumps[key] + 1 });
    setError(null);
  };

  const handleSubmit = () => {
    if (!valid) {
      setError(
        total !== BUILDER_TOTAL
          ? `스탯 총합이 ${BUILDER_TOTAL}이어야 합니다. (현재 ${total})`
          : "이름을 입력해주세요.",
      );
      return;
    }
    const statLine = STAT_KEYS.map((k) => `${k} ${stats[k]}`).join(" ");
    const text = `/init\n이름: ${name.trim()}\n스탯: ${statLine}`;
    onSend(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (valid) handleSubmit();
    }
  };

  const regNo = stampCode("moonhaven-harbour-customs-" + STAT_KEYS.join(""));

  return (
    <div className="lg-customs">
      <article className="lg-customs-paper">
        <div className="lg-customs-perforation" aria-hidden="true" />
        <header className="lg-customs-head">
          <svg className="lg-customs-seal" viewBox="0 0 64 64" aria-hidden="true">
            <circle className="lg-customs-seal-outer" cx="32" cy="32" r="29" />
            <circle className="lg-customs-seal-inner" cx="32" cy="32" r="23" />
            <g className="lg-customs-seal-tower-group">
              <path className="lg-customs-seal-tower" d="M26 48 L38 48 L36 30 L28 30 Z" />
              <rect className="lg-customs-seal-room" x="25" y="24" width="14" height="6" />
              <path className="lg-customs-seal-roof" d="M28 24 L32 17 L36 24 Z" />
              <circle className="lg-customs-seal-beam" cx="32" cy="27" r="1.6" />
              <line className="lg-customs-seal-base" x1="22" y1="48" x2="42" y2="48" />
            </g>
            <g className="lg-customs-seal-ticks" aria-hidden="true">
              <line x1="32" y1="5" x2="32" y2="9" />
              <line x1="59" y1="32" x2="55" y2="32" />
              <line x1="32" y1="59" x2="32" y2="55" />
              <line x1="5" y1="32" x2="9" y2="32" />
              <line x1="51.1" y1="12.9" x2="48.3" y2="15.7" />
              <line x1="51.1" y1="51.1" x2="48.3" y2="48.3" />
              <line x1="12.9" y1="51.1" x2="15.7" y2="48.3" />
              <line x1="12.9" y1="12.9" x2="15.7" y2="15.7" />
            </g>
          </svg>
          <div className="lg-customs-head-text">
            <span className="lg-customs-authority">MOONHAVEN HARBOUR AUTHORITY</span>
            <span className="lg-customs-title">Form A·VI — 입항 신고서</span>
            <span className="lg-customs-subtitle">Application for Entry Permit</span>
          </div>
          <div className="lg-customs-meta" aria-hidden="true">
            <div className="lg-customs-meta-row">
              <span className="lg-customs-meta-label">REG.</span>
              <span className="lg-customs-regno">№ {regNo}</span>
            </div>
            <div className="lg-customs-meta-row">
              <span className="lg-customs-meta-label">FOLIO</span>
              <span className="lg-customs-folio">A · VI</span>
            </div>
            <div className="lg-customs-meta-row">
              <span className="lg-customs-meta-label">PIER</span>
              <span className="lg-customs-folio">III</span>
            </div>
          </div>
        </header>

        <p className="lg-customs-instruction">
          <span className="lg-customs-instruction-mark">§</span>
          아래 항목을 채우고 서명하면 입항 허가가 발급됩니다.
        </p>

        <form
          className="lg-builder lg-customs-form"
          data-builder="1"
          onSubmit={(e) => e.preventDefault()}
        >
          <section className="lg-customs-section">
            <h3 className="lg-customs-section-title">
              <span className="lg-customs-section-no">I</span>
              <span className="lg-customs-section-text">
                자질 · 총 {BUILDER_TOTAL}점 (각 {BUILDER_MIN} ~ +{BUILDER_MAX})
              </span>
            </h3>
            <div className="lg-customs-rows">
              {STAT_KEYS.map((key, index) => {
                const value = stats[key];
                const minusDisabled = value <= BUILDER_MIN;
                const plusDisabled = value >= BUILDER_MAX || total >= BUILDER_TOTAL;
                const displayValue = value > 0 ? `+${value}` : String(value);
                return (
                  <div
                    key={key}
                    className="lg-customs-row"
                    style={{ ["--row-i" as any]: index }}
                  >
                    <span className="lg-customs-row-label">{key}</span>
                    <span className="lg-customs-row-leader" aria-hidden="true" />
                    <div className="lg-customs-stepper" data-stat={key}>
                      <button
                        type="button"
                        className="lg-customs-step"
                        aria-label={`${key} 감소`}
                        disabled={minusDisabled}
                        onClick={() => step(key, -1)}
                      >
                        −
                      </button>
                      {/* key에 bump count를 섞어 값 변경마다 span이 재마운트되며
                          CSS `lg-customs-value--bump` 애니메이션이 재시작된다. */}
                      <span
                        key={`${key}-${bumps[key]}`}
                        className={`lg-customs-value ${bumps[key] > 0 ? "lg-customs-value--bump" : ""}`}
                        data-value={value}
                      >
                        {displayValue}
                      </span>
                      <button
                        type="button"
                        className="lg-customs-step"
                        aria-label={`${key} 증가`}
                        disabled={plusDisabled}
                        onClick={() => step(key, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="lg-customs-totalbar">
            <div className="lg-customs-total" data-state={totalState}>
              <span className="lg-customs-total-label">기록 점수</span>
              <span className="lg-customs-total-value">{total}</span>
              <span className="lg-customs-total-target">/ {BUILDER_TOTAL}</span>
            </div>
            <div className="lg-customs-stamp" aria-hidden="true">
              <div className="lg-customs-stamp-inner">
                {totalState === "ok" ? (
                  <span className="lg-customs-stamp-line">등재 · APPROVED</span>
                ) : (
                  <span className="lg-customs-stamp-line">미완 · INCOMPLETE</span>
                )}
              </div>
            </div>
          </div>

          <section className="lg-customs-section">
            <h3 className="lg-customs-section-title">
              <span className="lg-customs-section-no">II</span>
              <span className="lg-customs-section-text">서명 · Signature</span>
            </h3>
            <div className="lg-customs-sig" data-focused={focused ? "1" : "0"}>
              <input
                type="text"
                className="lg-customs-sig-input"
                maxLength={20}
                placeholder="여기에 성함을 적어주세요"
                autoComplete="off"
                spellCheck={false}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={handleKeyDown}
              />
              <span className="lg-customs-sig-line" aria-hidden="true" />
              <span className="lg-customs-sig-caption" aria-hidden="true">
                성함 · Signed by hand
              </span>
            </div>
          </section>

          {error ? <p className="lg-customs-error">{error}</p> : null}

          <button
            type="button"
            className="lg-customs-submit"
            disabled={!valid}
            onClick={handleSubmit}
          >
            <span className="lg-customs-submit-text">입항 허가 · GRANT ENTRY</span>
            <svg className="lg-customs-submit-mark" viewBox="0 0 36 36" aria-hidden="true">
              <circle className="lg-customs-submit-mark-ring" cx="18" cy="18" r="14" />
              <path className="lg-customs-submit-mark-check" d="M11 18 L16 23 L25 13" />
            </svg>
          </button>
        </form>
      </article>
    </div>
  );
}

// ── Main renderer ──────────────────────────────────────────────────────────

function RendererContent(props: RendererContentProps): ReactElement {
  const { files, state, baseUrl, actions } = props;
  const ctx: RenderCtx = { files, baseUrl, state };

  const nameMap = buildNameMap(files);
  const mode = readWorldMode(files);
  const status = readStatusYaml(files);
  const stats = readStatsYaml(files);
  const inventory = readInventoryYaml(files);
  const quests = readQuestYaml(files);

  const sceneFiles = files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );
  const allContent = sceneFiles
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const entryCode = stampCode(allContent || "empty");
  const choices = parseChoicesMarker(allContent);
  const chatContent = stripRpgBlocks(allContent);

  const fallbackColorMap = new Map<string, string>();
  const persona = resolvePersona(ctx, nameMap);

  const parsed = chatContent
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  const isEmpty = sceneFiles.length === 0 || (groups.length === 0 && !status);

  return (
    <>
      <div className="lg-stage" data-mode={mode}>
        <LogHeader status={status} entryCode={entryCode} />
        <PassageBar persona={persona} />
        {isEmpty ? (
          <div className="lg-reel">
            <CharacterBuilder onSend={actions.send} />
          </div>
        ) : (
          <div className="lg-body">
            <div className="lg-reel">
              <Beats
                groups={groups}
                ctx={ctx}
                nameMap={nameMap}
                fallbackColorMap={fallbackColorMap}
                persona={persona}
              />
              <NextChoices options={choices} stats={stats} onFill={actions.fill} />
              <div data-chat-anchor />
            </div>
            {(() => {
              const hasAppendix =
                !!stats || inventory.length > 0 || quests.length > 0;
              return hasAppendix ? (
                <aside className="lg-side">
                  <Appendix items={inventory} quests={quests} stats={stats} />
                </aside>
              ) : null;
            })()}
          </div>
        )}
        <PendingCard state={state} mode={mode} />
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
