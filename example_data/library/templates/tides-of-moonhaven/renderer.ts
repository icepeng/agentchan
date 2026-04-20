// ─────────────────────────────────────────────────────────────────────────────
//   tides-of-moonhaven renderer  ·  "Vellum Day — Cartographer's Logbook"
//
//   햇빛 아래 펼쳐놓은 지도 제작자의 illuminated manuscript.
//   화면은 게임 UI가 아니라 크림 양피지 위에 손으로 기록되는 로그북이다.
//
//   · 팔레트: 낡은 양피지 크림 바탕 · 세피아 잉크 · 풍화된 청동(verdigris) ·
//     채식 필사본 구리(illuminated copper) · 버밀리온(manuscript vermilion)
//   · scheme: light — 프로젝트 페이지 동안 앱 전역을 라이트로 강제.
//     character-chat / sentinel(야간 다크)과 시간대가 수직으로 대비된다.
//
//   · 상단 LOG HEADER: bearing(위치) · vigor(HP) · anima(MP) · 감정 글리프
//   · 본문: 자막 플레이트 대사 / 여백 속삭임(>) / hairline 내레이션 /
//           잉크 스탬프 시스템 카드 / 세피아 폴라로이드 감정 삽화 /
//           컴퍼스 rose 디바이더
//   · 하단 APPENDIX: PACK MANIFEST(인벤토리) · STANDING CHARTS(퀘스트)
//
//   ⚠ legacy contract (Phase 2): 다른 템플릿은 `defineRenderer` mount 계약을
//     쓰지만 이 파일은 character builder가 인라인 <script> IIFE로
//     addEventListener를 단다 (라인 ~1715–1830). host의 legacy adapter가
//     `export function render`를 자동으로 mount contract로 wrap하므로 동작에
//     영향은 없다. Phase 4 (CSP 엄격 + 선언적 DSL 도입) 시 재작성 예정.
// ─────────────────────────────────────────────────────────────────────────────

interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: number;
}

interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
}

interface DataFile {
  type: "data";
  path: string;
  content: string;
  data: unknown;
  format: "yaml" | "json";
  modifiedAt: number;
}

type ProjectFile = TextFile | BinaryFile | DataFile;

// pi-ai content blocks (inline — 렌더러는 별도 transpile되어 import 불가)
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

// pi `AgentState`(agent/types.ts:221) UI subset — AgentPanel과 공유.
// 렌더러는 `state.messages`로 전체 흐름, `state.streamingMessage`로 in-flight,
// `state.pendingToolCalls.has(id)`로 진행 중 여부를 본다.
interface AgentState {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}

interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  state: AgentState;
}

// ── Renderer theme contract (inline — 렌더러는 별도 transpile되어 import 불가) ──

interface RendererThemeTokens {
  void?: string;
  base?: string;
  surface?: string;
  elevated?: string;
  accent?: string;
  fg?: string;
  fg2?: string;
  fg3?: string;
  edge?: string;
}

interface RendererTheme {
  base: RendererThemeTokens;
  dark?: Partial<RendererThemeTokens>;
  prefersScheme?: "light" | "dark";
}

// ── Theme: Vellum Day(평상) ↔ Iron Vigil(전투) ──
//
// world-state.yaml 의 mode 필드(peace|combat)에 따라 팔레트를 분기.
// peace: 크림 양피지 · 세피아 잉크 · 풍화 청동 · 채식 구리 (light scheme)
// combat: 어두운 가죽 · 촛불 황금 · 핏빛 잉크 (dark scheme)
// 둘 다 prefersScheme 명시 → Settings 이동 시 사용자의 원래 테마로 자동 복귀.

const PEACE_THEME: RendererTheme = {
  base: {
    void: "#e8dcc0", // 낡은 양피지 가장자리 (body bg)
    base: "#eee3c8", // 페이지 외곽
    surface: "#f6ecd2", // 로그북 본문
    elevated: "#fff8e4", // 폴라로이드·스탬프 캐리어
    accent: "#3d7a6d", // verdigris — 풍화된 청동, anima·신뢰·성공
    fg: "#2d2015", // 진한 세피아 잉크
    fg2: "#5a4530", // 중간 잉크
    fg3: "#8a6e4d", // 흐린 펜
    edge: "#3d2a15", // 잉크 hairline 기준색
  },
  prefersScheme: "light",
};

const COMBAT_THEME: RendererTheme = {
  base: {
    void: "#1a110a", // 검은 가죽 가장자리
    base: "#1a110a", // 어두운 가죽 본문
    surface: "#251810", // 패널
    elevated: "#2e1c14", // 카드·스탬프
    accent: "#d48a1f", // 촛불 황금 — 강조·성공·고리
    fg: "#d8c9a8", // 촛불 아래 양피지 색
    fg2: "#b8a38a", // 어두운 잉크
    fg3: "#8a7658", // 흐린 어두운 잉크
    edge: "#3d2a1f", // 어두운 가죽 hairline
  },
  prefersScheme: "dark",
};

function readWorldMode(ctx: RenderContext): "peace" | "combat" {
  const file = ctx.files.find(
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

export function theme(ctx: RenderContext): RendererTheme {
  return readWorldMode(ctx) === "combat" ? COMBAT_THEME : PEACE_THEME;
}

// ── Palette (renderer internal) ──────────────
//
// ILLUMINATED_COPPER · VERDIGRIS · VERMILION — 중세 채식 필사본(illuminated
// manuscript)의 세 가지 안료에서 차용한 이름. 야간 팔레트(lantern / moonwash /
// blood)와 의도적으로 다른 용어로 잡아 sentinel과의 정체성 혼동을 방지한다.

const ILLUMINATED_COPPER = "#b36b2a"; // 경고·vigor mid·브랜딩 글리프
const VERDIGRIS = "#3d7a6d"; // anima·신뢰·성공·컴퍼스 rose
const VERMILION = "#a83225"; // danger·HP low·상태이상 스탬프

// 라이트 크림 배경 위에서 시인성을 가진 중채도 안료 톤만 골라 구성.
const CHARACTER_COLORS = [
  "#3d7a6d", // verdigris
  "#b36b2a", // illuminated copper
  "#6a45a0", // royal violet ink
  "#a83a70", // magenta ink
  "#4a7a3a", // moss green
  "#c84a28", // vermilion orange
  "#2a5a8a", // sea navy
  "#8a3a2d", // iron rust
];

// ── Helpers ──────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 본문은 escapeHtml에서 " 이스케이프 → 스마트 쿼트 치환이 불가능해진다.
// 본문 텍스트용으로는 별도 처리: < > & 만 이스케이프하여 쿼트 변환을 살린다.
function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveImageUrl(
  ctx: RenderContext,
  dir: string,
  imageKey: string,
): string {
  return `${ctx.baseUrl}/files/${dir}/${imageKey}`;
}

// 이름 → 결정론적 정수 (폴라로이드 tilt 선택용)
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 로그 엔트리 번호: 씬 내용 길이를 해시하여 4자리 고정 (실제 시간이 아닌 장식용)
function stampCode(content: string): string {
  const h = hashStr(content) % 10000;
  return h.toString().padStart(4, "0");
}

// ── Chat Types ──────────────────────────────

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

// ── Name-based avatar resolution ────────────

interface NameMapEntry {
  dir: string;
  avatarImage: string;
  color?: string;
}

function buildNameMap(ctx: RenderContext): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const file of ctx.files) {
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

// ── Inline formatting ───────────────────────

const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;
const PLATE_ONLY_RE = /^\[[a-z0-9][a-z0-9-]*:[^\]]+\]$/;

function renderPolaroid(
  slug: string,
  imageKey: string,
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
): string {
  const entry = nameMap.get(slug);
  const dir = entry?.dir ?? slug;
  const url = resolveImageUrl(ctx, dir, imageKey);
  const tilt = (hashStr(slug + imageKey) % 5) - 2; // -2..2
  // displayName 추정: nameMap entry는 별칭 맵이라 역추적이 정확하지 않지만,
  // slug가 곧 디렉토리명이므로 파일 frontmatter의 display-name을 별도로 가져오진 않는다.
  // 태그에는 slug를 그대로 노출 (letterpress 캡션처럼 느껴진다).
  const tag = `${slug} · ${imageKey.replace(/^assets\//, "")}`;
  return `<figure class="lg-plate" data-tilt="${tilt}">
      <div class="lg-plate-frame">
        <img class="lg-plate-img" src="${escapeHtml(url)}" alt="${escapeHtml(tag)}" onerror="this.closest('.lg-plate').style.display='none'" />
        <div class="lg-plate-gloss"></div>
      </div>
      <figcaption class="lg-plate-tag">${escapeHtml(tag)}</figcaption>
    </figure>`;
}

function formatInline(
  text: string,
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
): string {
  let result = escapeText(text);
  result = result
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/"(.+?)"/g, "\u201c$1\u201d")
    .replace(/\*(.+?)\*/g, '<em class="lg-action">$1</em>');
  result = result.replace(INLINE_IMAGE, (_m, slug: string, key: string) => {
    return renderPolaroid(slug, key, ctx, nameMap);
  });
  return result;
}

// ── RPG Types ───────────────────────────────

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

// ── YAML Readers (DataFile.data is pre-parsed by scanner) ────────────

function findDataFile(ctx: RenderContext, path: string): DataFile | null {
  const file = ctx.files.find(
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

function readStatusYaml(ctx: RenderContext): RpgStatus | null {
  const file = findDataFile(ctx, "status.yaml");
  if (!file) return null;
  const root = asObject(file.data);
  if (!root) return null;
  const hpObj = asObject(root.hp) ?? {};
  const mpObj = asObject(root.mp) ?? {};
  const conditionsRaw = Array.isArray(root.conditions) ? root.conditions : [];
  return {
    hp: {
      current: asNumber(hpObj.current, 0),
      max: asNumber(hpObj.max, 0),
    },
    mp: {
      current: asNumber(mpObj.current, 0),
      max: asNumber(mpObj.max, 0),
    },
    emotion: asString(root.emotion),
    location: asString(root.location),
    conditions: conditionsRaw
      .map((c) => (typeof c === "string" ? c : null))
      .filter((c): c is string => c !== null && c.length > 0),
  };
}

function readInventoryYaml(ctx: RenderContext): InventoryItem[] {
  const file = findDataFile(ctx, "inventory.yaml");
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

function readStatsYaml(ctx: RenderContext): RpgStats | null {
  const file = findDataFile(ctx, "stats.yaml");
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

function readQuestYaml(ctx: RenderContext): QuestEntry[] {
  const file = findDataFile(ctx, "quest.yaml");
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

// ── [CHOICES] marker parser ────────────
//
// scene.md 의 마지막 [CHOICES]…[/CHOICES] 블록만 활성으로 추출한다.
// 매 응답 끝에 새 [CHOICES] 가 append 되므로 자연스럽게 stale 제거.
//
// 라인 형식:  - label: ... | action: ... | stat: ... | dc: ...

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
  // [CHOICES] 는 렌더러가 별도 처리. 본문에서 제거.
  // 구버전 [STATUS]/[INVENTORY]/[QUEST] 가 남아있을 수 있어 호환 차원에서 함께 제거.
  return content
    .replace(/\[CHOICES\]\n[\s\S]*?\n?\[\/CHOICES\]\n?/g, "")
    .replace(/\[STATUS\]\n[\s\S]*?\n?\[\/STATUS\]\n?/g, "")
    .replace(/\[INVENTORY\]\n[\s\S]*?\n?\[\/INVENTORY\]\n?/g, "")
    .replace(/\[QUEST\]\n[\s\S]*?\n?\[\/QUEST\]\n?/g, "");
}

// ── Chat Line Parsing (기존 로직 보존) ──────

const IMAGE_TOKEN_PREFIX = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*/;

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };

  const systemMatch = trimmed.match(/^\[SYSTEM\]\s+(.+)$/);
  if (systemMatch) return { type: "system", text: systemMatch[1] };

  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };

  // Strip [slug:imageKey] prefix (legacy: 캐릭터 라인 앞에 인라인 토큰)
  let rest = trimmed;
  let charDir: string | undefined;
  let imageKey: string | undefined;
  const tokenMatch = trimmed.match(IMAGE_TOKEN_PREFIX);
  if (tokenMatch) {
    charDir = tokenMatch[1];
    imageKey = tokenMatch[2];
    rest = trimmed.slice(tokenMatch[0].length);
  }

  // Primary: **Name:** text  또는  **Name**: text
  const charMatch = rest.match(/^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/);
  if (charMatch)
    return {
      type: "character",
      characterName: charMatch[1],
      charDir,
      imageKey,
      text: charMatch[2],
    };

  // Fallback: Name: "text"
  const charFallback = rest.match(/^([^\s:*][^:]{0,40}):\s*(["*\u201c].*)$/);
  if (charFallback)
    return {
      type: "character",
      characterName: charFallback[1],
      charDir,
      imageKey,
      text: charFallback[2],
    };

  // 단독 [slug:key] 라인 포함 — narration으로 떨어지며, 원본(trimmed)을
  // 그대로 formatInline에 넘겨서 폴라로이드로 재치환되게 한다.
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
    // 여기 도달하면 line.type은 "user" | "character" | "narration" — divider/system은 위에서 처리됨
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

// ── Character visuals ───────────────────────

interface CharacterInfo {
  color: string;
  portraitHtml: string;
}

interface PersonaInfo {
  displayName: string;
  color: string;
  portraitHtml: string;
  body: string;
}

function fallbackColor(name: string, map: Map<string, string>): string {
  if (map.has(name)) return map.get(name)!;
  const c = CHARACTER_COLORS[map.size % CHARACTER_COLORS.length];
  map.set(name, c);
  return c;
}

function resolveCharacterInfo(
  charDir: string | undefined,
  imageKey: string | undefined,
  displayName: string,
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): CharacterInfo {
  const entry = nameMap.get(displayName);
  const color = entry?.color || fallbackColor(displayName, fallbackColorMap);

  const resolvedDir = charDir ?? entry?.dir;
  if (resolvedDir && imageKey) {
    const src = resolveImageUrl(ctx, resolvedDir, imageKey);
    const portraitHtml = `
      <div class="lg-portrait">
        <div class="lg-portrait-halo"></div>
        <img class="lg-portrait-img" src="${escapeHtml(src)}" alt="${escapeHtml(displayName)}" onerror="this.parentElement.dataset.fallback='1'" />
        <div class="lg-portrait-fallback" aria-hidden="true">?</div>
      </div>`;
    return { color, portraitHtml };
  }

  return {
    color,
    portraitHtml: `<div class="lg-portrait" data-fallback="1">
        <div class="lg-portrait-halo"></div>
        <div class="lg-portrait-fallback" aria-hidden="true">?</div>
      </div>`,
  };
}

function resolvePersona(
  ctx: RenderContext,
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
  const isolatedColorMap = new Map<string, string>();
  const info = resolveCharacterInfo(
    dir,
    imageKey,
    displayName,
    ctx,
    nameMap,
    isolatedColorMap,
  );
  const color = fm.color ? String(fm.color) : info.color;

  return {
    displayName,
    color,
    portraitHtml: info.portraitHtml,
    body: personaFile.content,
  };
}

// ── Beat renderers ──────────────────────────

function renderCharacter(
  group: ChatGroup,
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
  id: string,
): string {
  const name = group.characterName!;
  const info = resolveCharacterInfo(
    group.charDir,
    group.imageKey,
    name,
    ctx,
    nameMap,
    fallbackColorMap,
  );
  const body = group.lines
    .map((l) => formatInline(l, ctx, nameMap))
    .join('<span class="lg-soft-break"></span>');

  return `
    <section id="${id}" class="lg-plate-dialogue" style="--c: ${escapeHtml(info.color)}">
      <div class="lg-plate-portrait">${info.portraitHtml}</div>
      <div class="lg-plate-caption">
        <header class="lg-nameplate">
          <span class="lg-nameplate-mark"></span>
          <span class="lg-nameplate-name">${escapeText(name)}</span>
        </header>
        <div class="lg-plate-body">${body}</div>
      </div>
    </section>`;
}

function renderUser(
  lines: string[],
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  persona: PersonaInfo | null,
  id: string,
): string {
  const body = lines
    .map((l) => formatInline(l, ctx, nameMap))
    .join('<span class="lg-soft-break"></span>');
  const label = persona ? persona.displayName : "";
  return `
    <aside id="${id}" class="lg-whisper">
      <div class="lg-whisper-body">${body}</div>
      ${label ? `<div class="lg-whisper-hand">— ${escapeText(label)}</div>` : ""}
    </aside>`;
}

function renderNarration(
  lines: string[],
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  id: string,
): string {
  // 단독 감정 삽화 라인은 hairline rule 없이 폴라로이드만 중앙 배치
  if (lines.length === 1 && PLATE_ONLY_RE.test(lines[0].trim())) {
    const content = formatInline(lines[0], ctx, nameMap);
    return `<div id="${id}" class="lg-plate-solo">${content}</div>`;
  }
  const content = lines
    .map((l) => formatInline(l, ctx, nameMap))
    .join('<span class="lg-soft-break"></span>');
  // 전체를 감싼 *...*는 이미 무대 지시문 — em 자체를 벗겨낸다
  return `
    <div id="${id}" class="lg-narration">
      <span class="lg-narration-rule"></span>
      <span class="lg-narration-text">${content}</span>
      <span class="lg-narration-rule"></span>
    </div>`;
}

function renderSystem(text: string, id: string): string {
  // 판정·이벤트·알림 등을 inline 잉크 스탬프로 표현
  return `
    <div id="${id}" class="lg-stamp-wrap">
      <div class="lg-stamp">
        <span class="lg-stamp-glyph" aria-hidden="true">&#x2726;</span>
        <span class="lg-stamp-text">${escapeText(text)}</span>
      </div>
    </div>`;
}

function renderDivider(id: string): string {
  // 컴퍼스 rose SVG + 양쪽 fade rule. 아주 느리게 회전.
  return `
    <div id="${id}" class="lg-divider" role="separator">
      <span class="lg-divider-rule"></span>
      <svg class="lg-rose" viewBox="0 0 40 40" aria-hidden="true">
        <g class="lg-rose-spin">
          <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.35" />
          <path d="M20 4 L22 20 L20 36 L18 20 Z" fill="currentColor" opacity="0.85" />
          <path d="M4 20 L20 18 L36 20 L20 22 Z" fill="currentColor" opacity="0.65" />
          <path d="M8.5 8.5 L21 19 L31.5 31.5 L19 21 Z" fill="currentColor" opacity="0.4" />
          <path d="M31.5 8.5 L21 21 L8.5 31.5 L19 19 Z" fill="currentColor" opacity="0.4" />
          <circle cx="20" cy="20" r="1.5" fill="currentColor" />
        </g>
      </svg>
      <span class="lg-divider-rule"></span>
    </div>`;
}

// ── Log Header (상단 스트립) ─────────────────

function vigorTone(pct: number): { color: string; label: string } {
  if (pct > 0.66) return { color: VERDIGRIS, label: "VITAL" };
  if (pct > 0.33) return { color: ILLUMINATED_COPPER, label: "STRAINED" };
  return { color: VERMILION, label: "FAILING" };
}

function renderVitalGauge(
  label: string,
  current: number,
  max: number,
  color: string,
): string {
  const pct = Math.max(0, Math.min(1, max > 0 ? current / max : 0));
  const dashLen = 100;
  const filled = (pct * dashLen).toFixed(1);
  // SVG stroke-dasharray 기반 게이지. 잉크가 번지듯 transition.
  return `
    <div class="lg-vital">
      <span class="lg-vital-label">${escapeText(label)}</span>
      <svg class="lg-vital-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="3" x2="100" y2="3" class="lg-vital-track" />
        <line x1="0" y1="3" x2="100" y2="3" class="lg-vital-fill" style="stroke:${escapeHtml(color)};stroke-dasharray:${filled} ${(100 - Number(filled)).toFixed(1)};" />
      </svg>
      <span class="lg-vital-value" style="color:${escapeHtml(color)}">${current}<span class="lg-vital-slash">/</span>${max}</span>
    </div>`;
}

function renderLogHeader(status: RpgStatus | null, entryCode: string): string {
  if (!status) {
    // STATUS 블록이 아직 없을 때는 얇은 바인딩 스트립만 보여준다
    return `
      <header class="lg-header lg-header--empty">
        <div class="lg-header-brand">
          <svg class="lg-lantern" viewBox="0 0 16 22" aria-hidden="true">
            <ellipse cx="8" cy="10" rx="5" ry="6" class="lg-lantern-glow" />
            <rect x="3.5" y="4" width="9" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="0.6" />
            <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" stroke-width="0.6" />
            <line x1="5" y1="4" x2="5" y2="16" stroke="currentColor" stroke-width="0.4" opacity="0.5" />
            <line x1="11" y1="4" x2="11" y2="16" stroke="currentColor" stroke-width="0.4" opacity="0.5" />
            <rect x="5.5" y="16" width="5" height="2" fill="none" stroke="currentColor" stroke-width="0.5" />
          </svg>
          <span class="lg-header-title">The Cartographer's Log</span>
        </div>
        <span class="lg-header-stamp">LOG&nbsp;&middot;&nbsp;${escapeText(entryCode)}</span>
      </header>`;
  }

  const vigorColor = status.hp
    ? vigorTone(status.hp.current / Math.max(1, status.hp.max)).color
    : VERDIGRIS;
  const hpBar = status.hp
    ? renderVitalGauge("VIGOR", status.hp.current, status.hp.max, vigorColor)
    : "";
  const mpBar = status.mp
    ? renderVitalGauge("ANIMA", status.mp.current, status.mp.max, VERDIGRIS)
    : "";

  const emotion = status.emotion
    ? `<span class="lg-emotion" aria-label="emotion">${escapeText(status.emotion)}</span>`
    : "";
  const bearing = status.location
    ? `<div class="lg-bearing">
        <svg class="lg-bearing-mark" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.5" />
          <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="0.5" opacity="0.35" />
          <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="0.5" opacity="0.35" />
          <path d="M7 2 L8 7 L7 12 L6 7 Z" fill="currentColor" />
        </svg>
        <span class="lg-bearing-label">BEARING</span>
        <span class="lg-bearing-text">${escapeText(status.location)}</span>
      </div>`
    : "";

  const effects =
    status.conditions.length > 0
      ? `<span class="lg-effect">${escapeText(status.conditions.join(" · "))}</span>`
      : "";

  return `
    <header class="lg-header">
      <div class="lg-header-row lg-header-row--top">
        <div class="lg-header-brand">
          <svg class="lg-lantern" viewBox="0 0 16 22" aria-hidden="true">
            <ellipse cx="8" cy="10" rx="5" ry="6" class="lg-lantern-glow" />
            <rect x="3.5" y="4" width="9" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="0.6" />
            <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" stroke-width="0.6" />
            <line x1="5" y1="4" x2="5" y2="16" stroke="currentColor" stroke-width="0.4" opacity="0.5" />
            <line x1="11" y1="4" x2="11" y2="16" stroke="currentColor" stroke-width="0.4" opacity="0.5" />
            <rect x="5.5" y="16" width="5" height="2" fill="none" stroke="currentColor" stroke-width="0.5" />
          </svg>
          <span class="lg-header-title">The Cartographer's Log</span>
        </div>
        <div class="lg-header-meta">
          ${emotion}
          ${effects}
          <span class="lg-header-stamp">LOG&nbsp;&middot;&nbsp;${escapeText(entryCode)}</span>
        </div>
      </div>
      <div class="lg-header-row lg-header-row--bottom">
        ${bearing}
        <div class="lg-vitals">${hpBar}${mpBar}</div>
      </div>
    </header>`;
}

// ── Appendix: Pack Manifest / Standing Charts ──

function renderPackManifest(items: InventoryItem[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item) => {
      const qty =
        typeof item.qty === "number" && item.qty > 1
          ? ` <span class="lg-item-qty">&times;${item.qty}</span>`
          : "";
      const note = item.note
        ? ` <span class="lg-item-desc">— ${escapeText(item.note)}</span>`
        : "";
      return `<li class="lg-item lg-item--kept"><span class="lg-item-glyph">&middot;</span><span class="lg-item-name">${escapeText(item.name)}</span>${qty}${note}</li>`;
    })
    .join("");

  return `
    <details class="lg-appendix-section">
      <summary class="lg-appendix-head">
        <span class="lg-appendix-title" data-short="Pack">Pack Manifest</span>
        <span class="lg-appendix-count">${items.length.toString().padStart(2, "0")}</span>
        <span class="lg-appendix-chevron" aria-hidden="true"></span>
      </summary>
      <ul class="lg-item-list">${rows}</ul>
    </details>`;
}

function renderStandingCharts(quests: QuestEntry[]): string {
  if (quests.length === 0) return "";
  const openCount = quests.filter((q) => q.status !== "done").length;
  const rows = quests
    .map((q) => {
      const cls =
        q.status === "done"
          ? "lg-quest lg-quest--closed"
          : "lg-quest lg-quest--pursuing";
      const glyph =
        q.status === "done"
          ? '<span class="lg-quest-glyph">&#x2713;</span>'
          : `<span class="lg-quest-glyph" style="color:${ILLUMINATED_COPPER}">&#x223D;</span>`;
      const flag =
        q.status === "done"
          ? '<span class="lg-quest-flag lg-quest-flag--closed">closed</span>'
          : '<span class="lg-quest-flag">in pursuit</span>';
      const desc = q.note
        ? ` <span class="lg-quest-desc">— ${escapeText(q.note)}</span>`
        : "";
      return `<li class="${cls}">${glyph}<span class="lg-quest-name">${escapeText(q.title)}</span>${desc}${flag}</li>`;
    })
    .join("");

  return `
    <details class="lg-appendix-section">
      <summary class="lg-appendix-head">
        <span class="lg-appendix-title" data-short="Charts">Standing Charts</span>
        <span class="lg-appendix-count">${openCount.toString().padStart(2, "0")}</span>
        <span class="lg-appendix-chevron" aria-hidden="true"></span>
      </summary>
      <ul class="lg-quest-list">${rows}</ul>
    </details>`;
}

// Ability Scores — stats.yaml 의 4개 능력치를 보정치 형태(+/-)로 표시.
// 0 이상은 +prefix, 음수는 그대로. 값 강도에 따라 highlight 클래스 토글.

function renderAbilityScores(stats: RpgStats | null): string {
  if (!stats) return "";
  const rows = STAT_KEYS.map((key) => {
    const value = stats[key];
    const mod = formatMod(value);
    const tone =
      value >= 3 ? "lg-ability--strong" : value <= -1 ? "lg-ability--weak" : "";
    return `<li class="lg-ability ${tone}">
      <span class="lg-ability-ko">${escapeText(key)}</span>
      <span class="lg-ability-mod">${mod}</span>
    </li>`;
  }).join("");

  return `
    <details class="lg-appendix-section" open>
      <summary class="lg-appendix-head">
        <span class="lg-appendix-title" data-short="Scores">Ability Scores</span>
        <span class="lg-appendix-count">4</span>
        <span class="lg-appendix-chevron" aria-hidden="true"></span>
      </summary>
      <ul class="lg-ability-list">${rows}</ul>
    </details>`;
}

// Persona body는 heading/문단/불릿만 지원하는 미니 markdown. chat 전용 formatInline은
// *강조*·이미지 토큰 등 산문에 부적절한 변환이 섞여 있어 여기서는 재사용하지 않는다.
function renderPersonaBody(body: string): string {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${paragraph.map(escapeText).join(" ")}</p>`);
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      out.push(
        `<ul>${bullets.map((b) => `<li>${escapeText(b)}</li>`).join("")}</ul>`,
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
      out.push(`<h6>${escapeText(h3[1] ?? "")}</h6>`);
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flushAll();
      out.push(`<h5>${escapeText(h2[1] ?? "")}</h5>`);
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      flushAll();
      out.push(`<h4>${escapeText(h1[1] ?? "")}</h4>`);
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

  return out.join("");
}

function renderPersonaBar(persona: PersonaInfo | null): string {
  if (!persona) return "";
  const body = renderPersonaBody(persona.body);
  if (!body) return "";
  return `
    <details class="lg-passage" style="--c: ${escapeHtml(persona.color)}">
      <summary class="lg-passage-strip">
        <span class="lg-passage-seal" aria-hidden="true">
          <span class="lg-passage-seal-avatar">${persona.portraitHtml}</span>
        </span>
        <span class="lg-passage-label">PASSAGE&nbsp;PAPERS</span>
        <span class="lg-passage-divider" aria-hidden="true"></span>
        <span class="lg-passage-name">${escapeText(persona.displayName)}</span>
        <span class="lg-passage-hint">
          <span class="lg-passage-hint-text">DOSSIER</span>
          <span class="lg-passage-hint-text lg-passage-hint-text--open">접기</span>
          <span class="lg-passage-chevron" aria-hidden="true"></span>
        </span>
      </summary>
      <div class="lg-passage-drawer" role="region" aria-label="Passage papers dossier">
        <div class="lg-passage-card">
          <div class="lg-passage-meridian" aria-hidden="true">
            <span class="lg-passage-meridian-mark">&#x2726;</span>
          </div>
          <div class="lg-passage-corner lg-passage-corner--tl" aria-hidden="true"></div>
          <div class="lg-passage-corner lg-passage-corner--tr" aria-hidden="true"></div>
          <div class="lg-passage-corner lg-passage-corner--bl" aria-hidden="true"></div>
          <div class="lg-passage-corner lg-passage-corner--br" aria-hidden="true"></div>
          <header class="lg-passage-head">
            <div class="lg-passage-portrait">${persona.portraitHtml}</div>
            <div class="lg-passage-title">
              <span class="lg-passage-eyebrow">Archivist&apos;s Dossier</span>
              <h3 class="lg-passage-display">${escapeText(persona.displayName)}</h3>
              <span class="lg-passage-rule"></span>
            </div>
            <span class="lg-passage-stamp" aria-hidden="true">
              <span class="lg-passage-stamp-top">FILED</span>
              <span class="lg-passage-stamp-mid">&#x26C6;</span>
              <span class="lg-passage-stamp-bot">UNDER LOG</span>
            </span>
          </header>
          <div class="lg-passage-body">${body}</div>
        </div>
      </div>
    </details>`;
}

function renderAppendix(
  items: InventoryItem[],
  quests: QuestEntry[],
  stats: RpgStats | null,
): string {
  const abilities = renderAbilityScores(stats);
  const manifest = renderPackManifest(items);
  const charts = renderStandingCharts(quests);
  if (!abilities && !manifest && !charts) return "";
  return `
    <footer class="lg-appendix">
      ${abilities}
      ${manifest}
      ${charts}
    </footer>`;
}

// ── Next Choices (선택지 버튼) ──────────────
//
// scene.md 의 마지막 [CHOICES] 블록만 렌더링. data-action="fill" 로 클릭 시 입력창에 채움.
// 메타 칩(stat / dc) 은 옵션. 계단식 등장(--i 인덱스 기반).

function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function lookupStatMod(stats: RpgStats | null, stat: string): number | null {
  if (!stats) return null;
  const match = STAT_KEYS.find((k) => k === stat);
  return match ? stats[match] : null;
}

function renderNextChoices(
  options: ChoiceOption[],
  stats: RpgStats | null,
): string {
  if (options.length === 0) return "";
  const rows = options
    .map((opt, i) => {
      const mod = opt.stat ? lookupStatMod(stats, opt.stat) : null;
      const statText = opt.stat
        ? mod !== null
          ? `${opt.stat} ${formatMod(mod)}`
          : opt.stat
        : "";
      const stat = statText
        ? `<span class="lg-choice-stat">${escapeText(statText)}</span>`
        : "";
      const dc =
        typeof opt.dc === "number"
          ? `<span class="lg-choice-dc">DC ${opt.dc}</span>`
          : "";
      const meta =
        stat || dc ? `<span class="lg-choice-meta">${stat}${dc}</span>` : "";
      return `<button type="button"
                class="lg-choice-option"
                style="--i:${i}"
                data-action="fill"
                data-text="${escapeHtml(opt.action)}">
                <span class="lg-choice-label">${escapeText(opt.label)}</span>
                ${meta}
              </button>`;
    })
    .join("");

  return `
    <div class="lg-choice" role="group" aria-label="다음 행동">
      <div class="lg-choice-head">
        <span class="lg-choice-glyph" aria-hidden="true">&#x2756;</span>
        <span class="lg-choice-title">다음 행동</span>
        <span class="lg-choice-hint">버튼을 누르면 입력창에 채워집니다. 자유 입력도 가능합니다.</span>
      </div>
      <div class="lg-choice-list">${rows}</div>
    </div>`;
}

// ── Scriptorium Ritual (스트리밍 중 시각 피드백) ─────────
//
// 도구 호출 단계마다 작은 의식이 돌아간다. dice-roll(script) 호출은
// args/result.content를 통해 실제 굴러나온 숫자에 정확히 멈춘다.
// id 고정 → Idiomorph가 DOM을 보존하므로 CSS 애니메이션이 끊기지 않는다.

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

function lastSegment(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
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
      return p.length > 28 ? p.slice(0, 28) + "\u2026" : p;
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
      // dice-roll skill: { file: "skills/dice-roll/scripts/roll.ts", args: ["1d20+3", "12"] }
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

interface DiceResult {
  rolls: number[];
  total: number;
  dc: number | null;
  passed: boolean | null;
  margin: number | null;
}

function parseDiceResult(
  content: ToolResultContent | undefined,
): DiceResult | null {
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
    // Strip ~N~ markers for "discarded" dice, take just numbers
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

// SVG die: 44×44 rounded square, face number at center. Centered around
// viewBox center (150, 70). `transform-box: fill-box` keeps tumble centered.
function renderDieSvg(
  index: number,
  total: number,
  face: string,
  settled: boolean,
): string {
  // Spacing shrinks as count grows so 5 dice still fit in 300px wide
  const spacing = total <= 2 ? 64 : total === 3 ? 60 : total === 4 ? 52 : 46;
  const centerX = 150;
  const x = centerX + (index - (total - 1) / 2) * spacing;
  const stagger = (index % 3) * 0.08;
  return `
    <g class="rdie" transform="translate(${x.toFixed(1)} 68)" data-settled="${settled ? "1" : "0"}" style="--ddur: ${(0.85 + stagger).toFixed(2)}s; --ddly: -${stagger.toFixed(2)}s">
      <g class="rdie-spin">
        <rect class="rdie-face" x="-22" y="-22" width="44" height="44" rx="7" />
        <text class="rdie-text" x="0" y="1" text-anchor="middle" dominant-baseline="middle">${escapeText(face)}</text>
      </g>
    </g>`;
}

function renderDiceCanvas(
  parse: DiceParse | null,
  result: DiceResult | null,
): string {
  // Cap visible dice at 5; show "+N" badge if more
  const totalDice = parse?.count ?? 1;
  const visibleDice = Math.min(totalDice, 5);
  const overflow = totalDice - visibleDice;

  const settled = result !== null;
  const dies: string[] = [];
  for (let i = 0; i < visibleDice; i++) {
    const face = settled
      ? String(result.rolls[i] ?? "?")
      : "?";
    dies.push(renderDieSvg(i, visibleDice, face, settled));
  }

  const overflowBadge = overflow > 0
    ? `<text class="rdie-overflow" x="288" y="30" text-anchor="end">+${overflow}</text>`
    : "";

  // DC inscription on the left (when DC present), modifier on the right
  const dcPart = parse?.dc != null
    ? `<g class="rdc-target" transform="translate(36 68)">
        <circle class="rdc-ring" cx="0" cy="0" r="22"/>
        <circle class="rdc-ring rdc-ring-inner" cx="0" cy="0" r="14"/>
        <text class="rdc-label" x="0" y="-28" text-anchor="middle">DC</text>
        <text class="rdc-value" x="0" y="5" text-anchor="middle">${parse.dc}</text>
      </g>`
    : "";

  const modPart = parse && parse.mod !== 0
    ? `<g class="rdc-mod" transform="translate(264 68)">
        <text class="rdc-mod-sign" x="0" y="-4" text-anchor="middle">${parse.mod > 0 ? "+" : "\u2212"}</text>
        <text class="rdc-mod-value" x="0" y="22" text-anchor="middle">${Math.abs(parse.mod)}</text>
        <text class="rdc-mod-label" x="0" y="38" text-anchor="middle">MOD</text>
      </g>`
    : "";

  return dcPart + modPart + dies.join("") + overflowBadge;
}

function renderDiceVerdict(
  parse: DiceParse | null,
  result: DiceResult | null,
): string {
  if (!parse || !result) return "";
  const { total, dc, passed, margin } = result;
  const marginStr = margin != null ? (margin >= 0 ? `+${margin}` : `${margin}`) : "";
  const stamp = passed === true
    ? `<span class="lg-dice-stamp lg-dice-stamp--pass">
        <span class="lg-dice-stamp-word">PASS</span>
        <span class="lg-dice-stamp-dc">${dc != null ? `DC ${dc} · 차이 ${marginStr}` : ""}</span>
      </span>`
    : passed === false
      ? `<span class="lg-dice-stamp lg-dice-stamp--fail">
          <span class="lg-dice-stamp-word">FAIL</span>
          <span class="lg-dice-stamp-dc">${dc != null ? `DC ${dc} · 차이 ${marginStr}` : ""}</span>
        </span>`
      : "";
  return `
    <div class="lg-dice-verdict" aria-hidden="true">
      <span class="lg-dice-total">${total}</span>
      ${stamp}
    </div>`;
}

// Generic ritual scenes — abstract glyphs for non-dice tools.
// Scenes share viewBox 0 0 300 140; center is (150, 70).
function renderGenericScenes(): string {
  return `
    <g class="rscene rscene-thinking" aria-hidden="true">
      <ellipse cx="150" cy="120" rx="46" ry="8" class="rs-shadow"/>
      <path class="rs-pot" d="M 112 80 L 112 116 Q 112 128 150 128 Q 188 128 188 116 L 188 80 Z"/>
      <ellipse cx="150" cy="80" rx="38" ry="9" class="rs-pot-rim"/>
      <ellipse cx="150" cy="82" rx="30" ry="6" class="rs-ink"/>
      <circle cx="150" cy="82" r="10" class="rs-ripple rs-ripple-1"/>
      <circle cx="150" cy="82" r="10" class="rs-ripple rs-ripple-2"/>
      <circle cx="150" cy="82" r="10" class="rs-ripple rs-ripple-3"/>
      <path class="rs-vapor rs-vapor-1" d="M 138 62 Q 132 46 150 36 Q 168 26 150 10"/>
      <path class="rs-vapor rs-vapor-2" d="M 162 62 Q 168 48 155 40 Q 140 30 158 18"/>
    </g>
    <g class="rscene rscene-read" aria-hidden="true">
      <path class="rs-page rs-page-l" d="M 154 30 L 50 34 L 54 118 L 150 114 Z"/>
      <path class="rs-page rs-page-r" d="M 146 30 L 250 34 L 246 118 L 150 114 Z"/>
      <path class="rs-spine" d="M 150 30 L 150 114"/>
      <line class="rs-line rs-line-1" x1="62" y1="52" x2="136" y2="50"/>
      <line class="rs-line rs-line-2" x1="62" y1="68" x2="134" y2="66"/>
      <line class="rs-line rs-line-3" x1="62" y1="84" x2="132" y2="82"/>
      <line class="rs-line rs-line-4" x1="62" y1="100" x2="130" y2="98"/>
      <line class="rs-line rs-line-5" x1="164" y1="52" x2="238" y2="54"/>
      <line class="rs-line rs-line-6" x1="164" y1="68" x2="236" y2="70"/>
      <line class="rs-line rs-line-7" x1="164" y1="84" x2="234" y2="86"/>
      <line class="rs-line rs-line-8" x1="164" y1="100" x2="232" y2="102"/>
    </g>
    <g class="rscene rscene-grep" aria-hidden="true">
      <line class="rs-grep-line rs-grep-line-1" x1="32" y1="44" x2="268" y2="44"/>
      <line class="rs-grep-line rs-grep-line-2" x1="32" y1="70" x2="268" y2="70"/>
      <line class="rs-grep-line rs-grep-line-3" x1="32" y1="96" x2="268" y2="96"/>
      <circle class="rs-grep-hit rs-grep-hit-1" cx="68" cy="44" r="3"/>
      <circle class="rs-grep-hit rs-grep-hit-2" cx="168" cy="70" r="3"/>
      <circle class="rs-grep-hit rs-grep-hit-3" cx="228" cy="96" r="3"/>
      <g class="rs-lens">
        <circle class="rs-lens-ring" cx="0" cy="0" r="22"/>
        <circle class="rs-lens-glass" cx="0" cy="0" r="18"/>
        <line class="rs-lens-handle" x1="16" y1="16" x2="30" y2="30"/>
      </g>
    </g>
    <g class="rscene rscene-write" aria-hidden="true">
      <rect class="rs-parchment" x="36" y="40" width="228" height="82" rx="4"/>
      <line class="rs-write-line rs-write-line-1" x1="52" y1="60" x2="220" y2="60"/>
      <line class="rs-write-line rs-write-line-2" x1="52" y1="80" x2="200" y2="80"/>
      <line class="rs-write-line rs-write-line-3" x1="52" y1="100" x2="170" y2="100"/>
      <g class="rs-quill">
        <path class="rs-quill-feather" d="M 232 6 Q 262 30 252 78 Q 244 86 236 78 Q 228 50 220 20 Z"/>
        <line class="rs-quill-shaft" x1="240" y1="60" x2="202" y2="96"/>
        <circle class="rs-quill-tip" cx="202" cy="96" r="2.6"/>
        <circle class="rs-quill-drop" cx="202" cy="106" r="2.2"/>
      </g>
    </g>
    <g class="rscene rscene-append" aria-hidden="true">
      <path class="rs-parchment rs-append-paper" d="M 36 30 L 248 30 L 264 46 L 264 118 L 36 118 Z"/>
      <path class="rs-append-fold" d="M 248 30 L 264 46 L 248 46 Z"/>
      <line class="rs-append-old rs-append-old-1" x1="50" y1="46" x2="210" y2="46"/>
      <line class="rs-append-old rs-append-old-2" x1="50" y1="58" x2="222" y2="58"/>
      <line class="rs-append-old rs-append-old-3" x1="50" y1="70" x2="196" y2="70"/>
      <line class="rs-append-old rs-append-old-4" x1="50" y1="82" x2="218" y2="82"/>
      <line class="rs-append-old rs-append-old-5" x1="50" y1="94" x2="184" y2="94"/>
      <path class="rs-append-caret" d="M 44 104 L 48 108 L 44 112"/>
      <circle class="rs-append-drop" cx="56" cy="100" r="2"/>
      <line class="rs-append-new" x1="50" y1="108" x2="208" y2="108"/>
    </g>
    <g class="rscene rscene-edit" aria-hidden="true">
      <rect class="rs-parchment" x="36" y="30" width="228" height="90" rx="4"/>
      <line class="rs-edit-line rs-edit-old-1" x1="52" y1="52" x2="216" y2="52"/>
      <line class="rs-edit-line rs-edit-old-2" x1="52" y1="76" x2="190" y2="76"/>
      <line class="rs-edit-line rs-edit-new" x1="52" y1="102" x2="244" y2="102"/>
      <line class="rs-edit-strike rs-edit-strike-1" x1="52" y1="52" x2="216" y2="52"/>
    </g>
    <g class="rscene rscene-tree" aria-hidden="true">
      <g class="rs-compass">
        <circle class="rs-compass-ring" cx="150" cy="70" r="54"/>
        <circle class="rs-compass-inner" cx="150" cy="70" r="40"/>
        <circle class="rs-compass-inner rs-compass-inner-2" cx="150" cy="70" r="26"/>
        <path class="rs-compass-rose" d="M 150 20 L 156 70 L 150 120 L 144 70 Z M 100 70 L 150 76 L 200 70 L 150 64 Z"/>
        <text class="rs-compass-mark" x="150" y="18" text-anchor="middle">N</text>
        <text class="rs-compass-mark" x="210" y="73" text-anchor="middle">E</text>
        <text class="rs-compass-mark" x="150" y="132" text-anchor="middle">S</text>
        <text class="rs-compass-mark" x="90" y="73" text-anchor="middle">W</text>
      </g>
      <g class="rs-needle">
        <path d="M 150 28 L 154 70 L 150 112 L 146 70 Z" class="rs-needle-shape"/>
      </g>
      <circle cx="150" cy="70" r="4" class="rs-compass-pivot"/>
    </g>
    <g class="rscene rscene-activate_skill" aria-hidden="true">
      <circle class="rs-sigil-outer" cx="150" cy="70" r="56"/>
      <circle class="rs-sigil-inner" cx="150" cy="70" r="40"/>
      <circle class="rs-sigil-inner rs-sigil-inner-2" cx="150" cy="70" r="26"/>
      <path class="rs-sigil-star" d="M 150 22 L 178 110 L 106 58 L 194 58 L 122 110 Z"/>
      <circle class="rs-sigil-core" cx="150" cy="70" r="5"/>
    </g>`;
}

function renderRitualCanvas(
  toolKey: string,
  argLabel: string,
  parse: DiceParse | null,
  result: DiceResult | null,
): string {
  const diceGroup = toolKey === "script"
    ? `<g class="rscene rscene-script" aria-hidden="true">${renderDiceCanvas(parse, result)}</g>`
    : "";
  const verdict = toolKey === "script" ? renderDiceVerdict(parse, result) : "";
  const argBadge = argLabel
    ? `<span class="lg-ritual-arg">${escapeText(argLabel)}</span>`
    : "";
  return `
    <div class="lg-ritual-stage">
      <svg class="lg-ritual-svg" viewBox="0 0 300 140" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        ${renderGenericScenes()}
        ${diceGroup}
      </svg>
      ${argBadge}
      ${verdict}
    </div>`;
}

// 현재 in-flight assistant message에서 toolCall 블록만 시간순으로 추출.
// agentchan은 turn 끝까지 persist를 미루므로 streamingMessage가 진행 중 toolCall의
// 단일 source.
function activeToolCalls(state: AgentState): ToolCall[] {
  const content = state.streamingMessage?.content ?? [];
  return content.filter((b): b is ToolCall => b.type === "toolCall");
}

// 가장 최근에 도착한 ToolResultMessage를 messages에서 찾는다.
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

function renderSealChain(
  state: AgentState,
  toolCalls: ReadonlyArray<ToolCall>,
): string {
  if (toolCalls.length === 0) return "";
  const max = 8;
  const visible = toolCalls.slice(-max);
  const overflow = toolCalls.length - visible.length;
  const seals = visible.map((tc) => {
    const result = findToolResult(state, tc.id);
    if (!result) {
      return `<span class="lg-seal lg-seal--live" title="${escapeHtml(tc.name)}" aria-hidden="true"></span>`;
    }
    const cls = result.isError ? "lg-seal--err" : "lg-seal--done";
    return `<span class="lg-seal ${cls}" title="${escapeHtml(tc.name)}" aria-hidden="true"></span>`;
  });
  const more = overflow > 0
    ? `<span class="lg-seal-more">+${overflow}</span>`
    : "";
  return `<div class="lg-ritual-chain" aria-hidden="true">${seals.join("")}${more}</div>`;
}

function renderPendingCard(
  state: AgentState,
  mode: "peace" | "combat",
): string {
  const hidden = state.isStreaming ? "" : ' hidden aria-hidden="true"';
  const tools = activeToolCalls(state);
  const latest = tools.length > 0 ? tools[tools.length - 1] : undefined;
  const inFlight = tools.find((tc) => !findToolResult(state, tc.id));
  // Active focus: prefer in-flight tool, else show settled state of last tool.
  const focus = inFlight ?? latest;
  const toolKey = focus?.name ?? "thinking";
  const focusResult = focus ? findToolResult(state, focus.id) : null;
  const stateAttr = focus
    ? focusResult
      ? "settled"
      : "busy"
    : "thinking";

  // Dice-specific data — only when focus tool is script
  const diceParse = toolKey === "script" ? parseDiceArgs(focus?.arguments) : null;
  const diceResult = toolKey === "script"
    ? parseDiceResult(focusResult?.content)
    : null;

  const narration = ritualNarration(mode, toolKey);
  const argLabel = focus ? ritualArgLabel(focus.name, focus.arguments) : "";
  const sealChain = renderSealChain(state, tools);

  return `
    <aside id="lg-pending" class="lg-ritual" data-mode="${mode}" data-tool="${escapeHtml(toolKey)}" data-state="${stateAttr}" role="status" aria-live="polite"${hidden}>
      <header class="lg-ritual-head">
        <span class="lg-ritual-name">${escapeText(narration)}</span>
      </header>
      ${renderRitualCanvas(toolKey, argLabel, diceParse, diceResult)}
      ${sealChain}
      <span class="lg-ritual-mote lg-ritual-mote-1" aria-hidden="true"></span>
      <span class="lg-ritual-mote lg-ritual-mote-2" aria-hidden="true"></span>
      <span class="lg-ritual-mote lg-ritual-mote-3" aria-hidden="true"></span>
      <span class="lg-ritual-mote lg-ritual-mote-4" aria-hidden="true"></span>
      <span class="lg-ritual-mote lg-ritual-mote-5" aria-hidden="true"></span>
      <span class="lg-ritual-mote lg-ritual-mote-6" aria-hidden="true"></span>
    </aside>`;
}

// ── Empty state: Character Builder ─────────────────────────────
// 제출 버튼은 capture-phase에서 검증 후 data-text를 채운다 — bubbling의
// RenderedView data-action="send" 핸들러가 그 값을 읽기 *전*에 끼어들어야
// 하므로 capture로 등록한다. 검증 실패 시 stopImmediatePropagation으로 차단.

const BUILDER_TOTAL = 6;
const BUILDER_MIN = -1;
const BUILDER_MAX = 5;

function renderBuilderStepper(key: StatKey, index: number): string {
  return `
    <div class="lg-customs-row" style="--row-i:${index}">
      <span class="lg-customs-row-label">${escapeText(key)}</span>
      <span class="lg-customs-row-leader" aria-hidden="true"></span>
      <div class="lg-customs-stepper" data-stat="${key}">
        <button type="button" class="lg-customs-step" data-inc="-1" aria-label="${escapeHtml(key)} 감소">&#x2212;</button>
        <span class="lg-customs-value" data-stat-value="${key}" data-value="0">0</span>
        <button type="button" class="lg-customs-step" data-inc="1" aria-label="${escapeHtml(key)} 증가">&#x002B;</button>
      </div>
    </div>`;
}

function renderEmpty(): string {
  const rows = STAT_KEYS.map((k, i) => renderBuilderStepper(k, i)).join("");
  const regNo = stampCode("moonhaven-harbour-customs-" + STAT_KEYS.join(""));

  return `
    <div class="lg-customs">
      <article class="lg-customs-paper">
        <div class="lg-customs-perforation" aria-hidden="true"></div>
        <header class="lg-customs-head">
          <svg class="lg-customs-seal" viewBox="0 0 64 64" aria-hidden="true">
            <circle class="lg-customs-seal-outer" cx="32" cy="32" r="29"/>
            <circle class="lg-customs-seal-inner" cx="32" cy="32" r="23"/>
            <g class="lg-customs-seal-tower-group">
              <path class="lg-customs-seal-tower" d="M26 48 L38 48 L36 30 L28 30 Z"/>
              <rect class="lg-customs-seal-room" x="25" y="24" width="14" height="6"/>
              <path class="lg-customs-seal-roof" d="M28 24 L32 17 L36 24 Z"/>
              <circle class="lg-customs-seal-beam" cx="32" cy="27" r="1.6"/>
              <line class="lg-customs-seal-base" x1="22" y1="48" x2="42" y2="48"/>
            </g>
            <g class="lg-customs-seal-ticks" aria-hidden="true">
              <line x1="32" y1="5" x2="32" y2="9"/>
              <line x1="59" y1="32" x2="55" y2="32"/>
              <line x1="32" y1="59" x2="32" y2="55"/>
              <line x1="5" y1="32" x2="9" y2="32"/>
              <line x1="51.1" y1="12.9" x2="48.3" y2="15.7"/>
              <line x1="51.1" y1="51.1" x2="48.3" y2="48.3"/>
              <line x1="12.9" y1="51.1" x2="15.7" y2="48.3"/>
              <line x1="12.9" y1="12.9" x2="15.7" y2="15.7"/>
            </g>
          </svg>
          <div class="lg-customs-head-text">
            <span class="lg-customs-authority">MOONHAVEN HARBOUR AUTHORITY</span>
            <span class="lg-customs-title">Form A&middot;VI &mdash; 입항 신고서</span>
            <span class="lg-customs-subtitle">Application for Entry Permit</span>
          </div>
          <div class="lg-customs-meta" aria-hidden="true">
            <div class="lg-customs-meta-row">
              <span class="lg-customs-meta-label">REG.</span>
              <span class="lg-customs-regno">№ ${regNo}</span>
            </div>
            <div class="lg-customs-meta-row">
              <span class="lg-customs-meta-label">FOLIO</span>
              <span class="lg-customs-folio">A · VI</span>
            </div>
            <div class="lg-customs-meta-row">
              <span class="lg-customs-meta-label">PIER</span>
              <span class="lg-customs-folio">III</span>
            </div>
          </div>
        </header>

        <p class="lg-customs-instruction">
          <span class="lg-customs-instruction-mark">&sect;</span>
          아래 항목을 채우고 서명하면 입항 허가가 발급됩니다.
        </p>

        <form class="lg-builder lg-customs-form" data-builder="1" onsubmit="return false">
          <section class="lg-customs-section">
            <h3 class="lg-customs-section-title">
              <span class="lg-customs-section-no">I</span>
              <span class="lg-customs-section-text">자질 &middot; 총 ${BUILDER_TOTAL}점 (각 ${BUILDER_MIN} ~ +${BUILDER_MAX})</span>
            </h3>
            <div class="lg-customs-rows">${rows}</div>
          </section>

          <div class="lg-customs-totalbar">
            <div class="lg-customs-total" data-builder-total>
              <span class="lg-customs-total-label">기록 점수</span>
              <span class="lg-customs-total-value" data-total-value>0</span>
              <span class="lg-customs-total-target">/ ${BUILDER_TOTAL}</span>
            </div>
            <div class="lg-customs-stamp" aria-hidden="true">
              <div class="lg-customs-stamp-inner">
                <span class="lg-customs-stamp-line" data-stamp-pending>미완 · INCOMPLETE</span>
                <span class="lg-customs-stamp-line" data-stamp-approved>등재 · APPROVED</span>
              </div>
            </div>
          </div>

          <section class="lg-customs-section">
            <h3 class="lg-customs-section-title">
              <span class="lg-customs-section-no">II</span>
              <span class="lg-customs-section-text">서명 &middot; Signature</span>
            </h3>
            <div class="lg-customs-sig" data-sig data-focused="0">
              <input type="text" class="lg-customs-sig-input" data-builder-name maxlength="20" placeholder="여기에 성함을 적어주세요" autocomplete="off" spellcheck="false" />
              <span class="lg-customs-sig-line" aria-hidden="true"></span>
              <span class="lg-customs-sig-caption" aria-hidden="true">성함 · Signed by hand</span>
            </div>
          </section>

          <p class="lg-customs-error" data-builder-error hidden></p>

          <button type="button" class="lg-customs-submit" data-builder-submit data-action="send" data-text="" disabled>
            <span class="lg-customs-submit-text">입항 허가 &middot; GRANT ENTRY</span>
            <svg class="lg-customs-submit-mark" viewBox="0 0 36 36" aria-hidden="true">
              <circle class="lg-customs-submit-mark-ring" cx="18" cy="18" r="14"/>
              <path class="lg-customs-submit-mark-check" d="M11 18 L16 23 L25 13"/>
            </svg>
          </button>
        </form>
      </article>
    </div>
    <script>
    (function () {
      var form = document.querySelector('.lg-builder[data-builder="1"]');
      if (!form) return;
      // Idiomorph가 attribute sync로 dataset.bound를 휘발시키므로 JS heap의
      // WeakSet으로 가드. form 노드가 GC되면 자동 제거.
      var bound = (window.__lgBuilderBound = window.__lgBuilderBound || new WeakSet());
      if (bound.has(form)) return;
      bound.add(form);

      var MIN = ${BUILDER_MIN};
      var MAX = ${BUILDER_MAX};
      var TARGET = ${BUILDER_TOTAL};
      var KEYS = ${JSON.stringify(STAT_KEYS)};

      var nameInput = form.querySelector('[data-builder-name]');
      var totalEl = form.querySelector('[data-total-value]');
      var totalBox = form.querySelector('[data-builder-total]');
      var sigEl = form.querySelector('[data-sig]');
      var errorEl = form.querySelector('[data-builder-error]');
      var submit = form.querySelector('[data-builder-submit]');

      function readStats() {
        var out = {};
        KEYS.forEach(function (k) {
          var el = form.querySelector('[data-stat-value="' + k + '"]');
          out[k] = el ? parseInt(el.dataset.value, 10) || 0 : 0;
        });
        return out;
      }

      function sum(stats) {
        return KEYS.reduce(function (a, k) { return a + stats[k]; }, 0);
      }

      function refresh() {
        var stats = readStats();
        var total = sum(stats);
        totalEl.textContent = String(total);
        totalBox.dataset.state = total === TARGET ? 'ok' : (total > TARGET ? 'over' : 'under');

        // 경계 도달한 +/- 버튼 비활성화 + 총합 초과 시 +1 억제
        KEYS.forEach(function (k) {
          var stepper = form.querySelector('.lg-customs-stepper[data-stat="' + k + '"]');
          if (!stepper) return;
          var value = stats[k];
          var minusBtn = stepper.querySelector('[data-inc="-1"]');
          var plusBtn = stepper.querySelector('[data-inc="1"]');
          if (minusBtn) minusBtn.disabled = value <= MIN;
          if (plusBtn) plusBtn.disabled = value >= MAX || total >= TARGET;
        });

        var name = (nameInput && nameInput.value || '').trim();
        var valid = total === TARGET && name.length > 0;
        submit.disabled = !valid;
        if (errorEl) {
          errorEl.hidden = true;
          errorEl.textContent = '';
        }
      }

      form.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-inc]') : null;
        if (!btn || !form.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        var stepper = btn.closest('.lg-customs-stepper');
        if (!stepper) return;
        var key = stepper.dataset.stat;
        var valueEl = stepper.querySelector('[data-stat-value="' + key + '"]');
        if (!valueEl) return;
        var cur = parseInt(valueEl.dataset.value, 10) || 0;
        var delta = parseInt(btn.dataset.inc, 10) || 0;
        var next = cur + delta;
        if (next < MIN || next > MAX) return;
        if (delta > 0) {
          var t = sum(readStats());
          if (t >= TARGET) return;
        }
        valueEl.dataset.value = String(next);
        valueEl.textContent = next > 0 ? ('+' + next) : String(next);
        valueEl.classList.remove('lg-customs-value--bump');
        void valueEl.offsetWidth;
        valueEl.classList.add('lg-customs-value--bump');
        refresh();
      });

      form.addEventListener('input', function (e) {
        if (e.target && e.target.matches && e.target.matches('[data-builder-name]')) {
          refresh();
        }
      });
      // focus/blur는 bubble 안 하므로 capture phase로 위임
      form.addEventListener('focus', function (e) {
        if (e.target && e.target.matches && e.target.matches('[data-builder-name]') && sigEl) {
          sigEl.dataset.focused = '1';
        }
      }, true);
      form.addEventListener('blur', function (e) {
        if (e.target && e.target.matches && e.target.matches('[data-builder-name]') && sigEl) {
          sigEl.dataset.focused = '0';
        }
      }, true);
      form.addEventListener('keydown', function (e) {
        if (!e.target || !e.target.matches || !e.target.matches('[data-builder-name]')) return;
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          var sBtn = form.querySelector('[data-builder-submit]');
          if (sBtn && !sBtn.disabled) sBtn.click();
        }
      });

      submit.addEventListener('click', function (e) {
        var stats = readStats();
        var total = sum(stats);
        var name = (nameInput && nameInput.value || '').trim();
        if (total !== TARGET || !name) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = total !== TARGET
              ? '스탯 총합이 ' + TARGET + '이어야 합니다. (현재 ' + total + ')'
              : '이름을 입력해주세요.';
          }
          return;
        }
        var statLine = KEYS.map(function (k) { return k + ' ' + stats[k]; }).join(' ');
        var text = '/init\\n이름: ' + name + '\\n스탯: ' + statLine;
        submit.dataset.text = text;
      }, true);

      refresh();
    })();
    </script>`;
}

// ── Beat assembly ────────────────────────────

function renderBeats(
  groups: ChatGroup[],
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
  persona: PersonaInfo | null,
): string {
  // index 기반 stable id → Idiomorph가 재렌더 간 노드를 보존하여 CSS 애니메이션 유지.
  return groups
    .map((g, i) => {
      const id = `lg-b-${i}`;
      switch (g.type) {
        case "user":
          return renderUser(g.lines, ctx, nameMap, persona, id);
        case "character":
          return renderCharacter(g, ctx, nameMap, fallbackColorMap, id);
        case "narration":
          return renderNarration(g.lines, ctx, nameMap, id);
        case "divider":
          return renderDivider(id);
        case "system":
          return renderSystem(g.lines[0] ?? "", id);
      }
    })
    .join("\n");
}

// ── Styles ───────────────────────────────────

const STYLES = `<style>
  /* ── Root: Logbook stage ─────────────────────────────────────── */
  .lg-stage {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    min-height: 100%;
    font-family: var(--font-family-body);
    color: var(--color-fg);
  }
  .lg-body {
    flex: 1;
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    box-sizing: border-box;
  }
  .lg-reel {
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 28px 28px 32px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 28px;
    box-sizing: border-box;
    min-width: 0;
  }
  .lg-side {
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 0 28px 24px;
    box-sizing: border-box;
    container-type: inline-size;
    container-name: lg-side;
  }
  @container (min-width: 1080px) {
    .lg-body {
      grid-template-columns: minmax(0, 1fr) minmax(0, 760px) minmax(180px, 1fr);
    }
    .lg-reel { grid-column: 2; }
    .lg-side {
      grid-column: 3;
      justify-self: start;
      position: sticky;
      top: 88px;
      align-self: start;
      max-width: 300px;
      margin: 0;
      padding: 28px clamp(12px, 4cqi, 24px) 32px;
      max-height: calc(100vh - 96px);
      overflow-y: auto;
    }
    .lg-side::-webkit-scrollbar { width: 6px; }
    .lg-side::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--color-edge) 30%, transparent);
      border-radius: 3px;
    }
  }

  /* ── Log Header: sticky 상단 스트립 ──────────────────────────── */
  .lg-header {
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 14px 28px 10px;
    background: color-mix(in srgb, var(--color-surface) 88%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 10%, transparent);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lg-header--empty {
    padding: 10px 28px;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .lg-header-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .lg-header-row--top { justify-content: space-between; }
  .lg-header-row--bottom { justify-content: space-between; gap: 24px; }

  .lg-header-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: ${ILLUMINATED_COPPER};
  }
  .lg-lantern {
    width: 16px;
    height: 22px;
    color: ${ILLUMINATED_COPPER};
    flex-shrink: 0;
  }
  .lg-lantern-glow {
    fill: ${ILLUMINATED_COPPER};
    opacity: 0.35;
    animation: lg-flicker 3.4s ease-in-out infinite;
    transform-origin: center;
  }
  @keyframes lg-flicker {
    0%, 100% { opacity: 0.32; transform: scale(1); }
    22%      { opacity: 0.48; transform: scale(1.06); }
    41%      { opacity: 0.28; transform: scale(0.96); }
    63%      { opacity: 0.44; transform: scale(1.04); }
    82%      { opacity: 0.3;  transform: scale(0.98); }
  }
  .lg-header-title {
    font-family: var(--font-family-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-fg-2);
  }

  .lg-header-meta {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .lg-emotion {
    font-size: 16px;
    line-height: 1;
    filter: drop-shadow(0 0 8px color-mix(in srgb, ${ILLUMINATED_COPPER} 40%, transparent));
  }
  .lg-effect {
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 3px 10px;
    color: ${VERMILION};
    background: color-mix(in srgb, ${VERMILION} 8%, transparent);
    border: 1px solid color-mix(in srgb, ${VERMILION} 28%, transparent);
    transform: rotate(-0.6deg);
  }
  .lg-header-stamp {
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.2em;
    color: var(--color-fg-3);
    text-transform: uppercase;
  }

  .lg-bearing {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .lg-bearing-mark {
    width: 14px;
    height: 14px;
    color: var(--color-fg-2);
    flex-shrink: 0;
  }
  .lg-bearing-label {
    font-family: var(--font-family-mono);
    font-size: 9px;
    letter-spacing: 0.24em;
    color: var(--color-fg-3);
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .lg-bearing-text {
    font-family: var(--font-family-display);
    font-size: 13px;
    letter-spacing: 0.04em;
    color: var(--color-fg);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lg-vitals {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-shrink: 0;
  }
  .lg-vital {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .lg-vital-label {
    font-family: var(--font-family-mono);
    font-size: 9px;
    letter-spacing: 0.22em;
    color: var(--color-fg-3);
    text-transform: uppercase;
    width: 42px;
    flex-shrink: 0;
  }
  .lg-vital-bar {
    width: 96px;
    height: 6px;
    flex-shrink: 0;
  }
  .lg-vital-track {
    stroke: color-mix(in srgb, var(--color-edge) 14%, transparent);
    stroke-width: 1.2;
  }
  .lg-vital-fill {
    stroke-width: 2;
    stroke-linecap: square;
    transition: stroke-dasharray 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    filter: drop-shadow(0 0 3px color-mix(in srgb, currentColor 40%, transparent));
  }
  .lg-vital-value {
    font-family: var(--font-family-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    min-width: 54px;
    text-align: right;
  }
  .lg-vital-slash {
    opacity: 0.45;
    margin: 0 1px;
  }

  /* ── Dialogue plate: 포트레이트 + 자막 ────────────────────────── */
  .lg-plate-dialogue {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 18px;
    align-items: flex-start;
    animation: lg-rise 0.6s ease-out;
  }
  .lg-plate-portrait { padding-top: 2px; }
  .lg-portrait {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 3px;
    overflow: hidden;
    background: color-mix(in srgb, var(--c) 16%, var(--color-surface));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c) 50%, transparent),
      0 6px 16px -10px rgba(61, 42, 21, 0.32);
    transition: box-shadow 0.4s ease;
  }
  .lg-plate-dialogue:hover .lg-portrait {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c) 85%, transparent),
      0 8px 20px -10px rgba(61, 42, 21, 0.42);
  }
  .lg-portrait-halo {
    position: absolute;
    inset: -35%;
    background: radial-gradient(circle, color-mix(in srgb, var(--c) 55%, transparent), transparent 58%);
    opacity: 0.3;
    filter: blur(16px);
    z-index: 0;
    pointer-events: none;
  }
  .lg-portrait-img {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
    display: block;
    filter: saturate(1.02) contrast(1.02);
  }
  .lg-portrait-fallback {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-family-display);
    font-size: 28px;
    font-weight: 500;
    color: color-mix(in srgb, var(--c) 75%, var(--color-fg-3));
  }
  .lg-portrait[data-fallback="1"] .lg-portrait-fallback { z-index: 2; }
  .lg-portrait[data-fallback="1"] .lg-portrait-img { visibility: hidden; }

  .lg-plate-caption { min-width: 0; padding-top: 4px; }
  .lg-nameplate {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    /* 캐릭터 색을 진한 세피아 잉크에 섞어 양피지 위에서 시인성 확보.
       각 캐릭터는 여전히 자기만의 잉크 톤(엘라라=어두운 구리, 렌=깊은 보라 등)으로 구분된다. */
    color: color-mix(in srgb, var(--c) 55%, var(--color-fg));
  }
  .lg-nameplate-mark {
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.55;
  }
  .lg-nameplate-name {
    font-family: var(--font-family-display);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.28em;
    text-transform: uppercase;
  }
  .lg-plate-body {
    font-size: 15.5px;
    line-height: 1.82;
    color: var(--color-fg);
    padding-left: 14px;
    border-left: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
    transition: border-color 0.4s ease;
  }
  .lg-plate-dialogue:hover .lg-plate-body {
    border-left-color: color-mix(in srgb, var(--c) 55%, transparent);
  }
  .lg-action {
    font-style: italic;
    color: var(--color-fg-2);
    letter-spacing: 0.005em;
  }
  .lg-soft-break { display: block; height: 5px; }

  /* ── Whisper: 우측 여백 사용자 속삭임 ────────────────────────── */
  .lg-whisper {
    align-self: flex-end;
    max-width: 66%;
    padding: 10px 24px 12px 30px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    color: var(--color-fg-2);
    font-family: var(--font-family-body);
    font-size: 15.5px;
    font-style: italic;
    line-height: 1.72;
    border-right: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
    animation: lg-rise 0.5s ease-out;
  }
  .lg-whisper-body { text-align: right; }
  .lg-whisper-hand {
    font-family: var(--font-family-display);
    font-style: normal;
    font-size: 9.5px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-fg-4);
  }

  /* ── Narration: hairline 사이 무대 지시문 ─────────────────────── */
  .lg-narration {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 18px;
    max-width: 680px;
    margin: 0 auto;
    color: var(--color-fg-2);
    animation: lg-rise 0.5s ease-out;
  }
  .lg-narration-rule {
    height: 1px;
    background: color-mix(in srgb, var(--color-edge) 18%, transparent);
  }
  .lg-narration-text {
    font-family: var(--font-family-body);
    font-size: 14.5px;
    font-style: italic;
    text-align: center;
    line-height: 1.72;
    letter-spacing: 0.005em;
    color: var(--color-fg-2);
  }
  .lg-narration-text .lg-action {
    font-style: italic;
    color: inherit;
  }
  .lg-plate-solo {
    display: flex;
    justify-content: center;
    padding: 4px 0;
    animation: lg-rise 0.6s ease-out;
  }

  /* ── Polaroid: 감정 삽화 ──────────────────────────────────────── */
  .lg-plate {
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
      0 14px 28px -18px rgba(61, 42, 21, 0.32),
      0 2px 6px -2px rgba(61, 42, 21, 0.18);
    max-width: 280px;
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease;
    animation: lg-settle 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .lg-plate[data-tilt="-2"] { transform: rotate(-2deg); }
  .lg-plate[data-tilt="-1"] { transform: rotate(-1deg); }
  .lg-plate[data-tilt="0"]  { transform: rotate(0deg); }
  .lg-plate[data-tilt="1"]  { transform: rotate(1deg); }
  .lg-plate[data-tilt="2"]  { transform: rotate(2deg); }
  .lg-plate:hover {
    transform: rotate(0deg) translateY(-2px);
    box-shadow:
      0 18px 32px -14px rgba(61, 42, 21, 0.42),
      0 4px 10px -2px rgba(61, 42, 21, 0.24);
  }
  .lg-plate-frame {
    position: relative;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-edge) 8%, transparent);
  }
  .lg-plate-img {
    display: block;
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    /* 양피지 위에 붙은 오래된 사진 느낌: 채도 낮추고 세피아 살짝 강하게 */
    filter: saturate(0.8) contrast(1.05) sepia(0.2) brightness(0.97);
  }
  .lg-plate-gloss {
    position: absolute;
    inset: 0;
    /* 라이트 배경에선 screen이 거의 안 보인다 → multiply로 따뜻한 오버레이 */
    background: linear-gradient(158deg,
      color-mix(in srgb, ${ILLUMINATED_COPPER} 22%, transparent) 0%,
      transparent 44%);
    mix-blend-mode: multiply;
    pointer-events: none;
  }
  .lg-plate-tag {
    margin-top: 8px;
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-fg-3);
    text-align: center;
  }

  /* ── System stamp: 판정·이벤트 잉크 카드 ──────────────────────── */
  .lg-stamp-wrap {
    display: flex;
    justify-content: center;
    animation: lg-ink 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .lg-stamp {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
    max-width: 88%;
    /* 텍스트는 진한 세피아 잉크로 가독성 확보, border·glyph만 copper로 정체성 유지 */
    color: var(--color-fg);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 6%, transparent);
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 42%, transparent);
    transform: rotate(-0.4deg);
  }
  .lg-stamp::before,
  .lg-stamp::after {
    content: "";
    position: absolute;
    width: 7px;
    height: 7px;
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 42%, transparent);
    /* void(조금 더 진한 양피지)로 스탬프 노치가 살짝 눌린 자국처럼 보이게 */
    background: var(--color-void);
  }
  .lg-stamp::before { top: -4px; left: -4px; }
  .lg-stamp::after  { bottom: -4px; right: -4px; }
  .lg-stamp-glyph {
    font-size: 14px;
    color: ${ILLUMINATED_COPPER};
    opacity: 0.9;
    flex-shrink: 0;
  }
  .lg-stamp-text {
    font-family: var(--font-family-body);
    font-size: 14px;
    letter-spacing: 0;
    line-height: 1.55;
  }

  /* ── Divider: 컴퍼스 rose ────────────────────────────────────── */
  .lg-divider {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 20px;
    margin: 18px auto;
    max-width: 560px;
    color: ${VERDIGRIS};
  }
  .lg-divider-rule {
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      color-mix(in srgb, ${VERDIGRIS} 45%, transparent) 50%,
      transparent 100%);
  }
  .lg-rose {
    width: 32px;
    height: 32px;
    color: ${VERDIGRIS};
    opacity: 0.85;
  }
  .lg-rose-spin {
    transform-origin: 20px 20px;
    animation: lg-rose-spin 90s linear infinite;
  }
  @keyframes lg-rose-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── Appendix: Pack Manifest / Standing Charts ────────────────── */
  .lg-appendix {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .lg-appendix-section {
    background: color-mix(in srgb, var(--color-surface) 96%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-edge) 22%, transparent);
    border-radius: 12px;
    box-shadow: 0 8px 28px -18px color-mix(in srgb, #000 38%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    overflow: hidden;
  }
  .lg-appendix-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 20px;
    cursor: pointer;
    list-style: none;
    user-select: none;
    transition: background 0.2s ease;
  }
  .lg-appendix-head::-webkit-details-marker { display: none; }
  .lg-appendix-head:hover {
    background: color-mix(in srgb, var(--color-fg) 3%, transparent);
  }
  .lg-appendix-title {
    font-family: var(--font-family-display);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: var(--color-fg-2);
  }
  .lg-appendix-count {
    font-family: var(--font-family-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: ${ILLUMINATED_COPPER};
    margin-left: auto;
  }
  .lg-appendix-chevron {
    width: 6px;
    height: 6px;
    border-right: 1px solid var(--color-fg-3);
    border-bottom: 1px solid var(--color-fg-3);
    transform: rotate(-135deg);
    transition: transform 0.3s ease;
    flex-shrink: 0;
  }
  .lg-appendix-section[open] .lg-appendix-chevron {
    transform: rotate(45deg);
  }

  /* ── Passage Papers: header에 착 달라붙는 통행문서 ledger tab ──── */
  /* Closed: sticky strip welded to header. Open: absolute dossier overlay. */
  .lg-passage {
    position: sticky;
    top: 58px;
    z-index: 4;
    background: color-mix(in srgb, var(--color-surface) 90%, transparent);
    backdrop-filter: blur(12px) saturate(1.05);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    border-bottom: 1px solid color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 26%, transparent);
  }
  .lg-passage[open] {
    z-index: 6;
  }

  .lg-passage-strip {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 9px 28px 9px 22px;
    cursor: pointer;
    list-style: none;
    user-select: none;
    transition: background 0.2s ease;
  }
  .lg-passage-strip::-webkit-details-marker { display: none; }
  .lg-passage-strip::before {
    /* hairline tick — signals flush attachment to header */
    content: "";
    position: absolute;
    left: 28px;
    top: 0;
    width: 1px;
    height: 6px;
    background: color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 40%, transparent);
  }
  .lg-passage-strip:hover {
    background: color-mix(in srgb, var(--c, var(--color-fg)) 5%, transparent);
  }
  .lg-passage-seal {
    flex-shrink: 0;
    position: relative;
    display: inline-flex;
    padding: 2px;
    border-radius: 999px;
    background: conic-gradient(from 120deg,
      var(--c, ${ILLUMINATED_COPPER}) 0deg,
      color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 20%, transparent) 140deg,
      var(--c, ${ILLUMINATED_COPPER}) 220deg,
      color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 20%, transparent) 360deg);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 35%, transparent);
  }
  .lg-passage-seal-avatar {
    display: inline-flex;
    background: var(--color-surface);
    border-radius: 999px;
    padding: 1px;
  }
  .lg-passage-seal-avatar .lg-portrait {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    overflow: hidden;
  }
  .lg-passage-seal-avatar .lg-portrait-img,
  .lg-passage-seal-avatar .lg-portrait-halo {
    border-radius: 999px;
  }
  .lg-passage-label {
    font-family: var(--font-family-display);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--color-fg-3);
    flex-shrink: 0;
  }
  .lg-passage-divider {
    width: 1px;
    height: 14px;
    background: color-mix(in srgb, var(--color-edge) 45%, transparent);
    flex-shrink: 0;
  }
  .lg-passage-name {
    font-family: var(--font-family-display);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--c, var(--color-fg));
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lg-passage-hint {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.32em;
    color: var(--color-fg-4);
    transition: color 0.2s ease;
  }
  .lg-passage-strip:hover .lg-passage-hint {
    color: var(--c, var(--color-fg-2));
  }
  .lg-passage-hint-text--open { display: none; }
  .lg-passage[open] .lg-passage-hint-text:not(.lg-passage-hint-text--open) { display: none; }
  .lg-passage[open] .lg-passage-hint-text--open { display: inline; }
  .lg-passage-chevron {
    width: 6px;
    height: 6px;
    border-right: 1px solid currentColor;
    border-bottom: 1px solid currentColor;
    transform: rotate(45deg);
    transition: transform 0.32s cubic-bezier(0.2, 0.75, 0.25, 1);
    flex-shrink: 0;
  }
  .lg-passage[open] .lg-passage-chevron {
    transform: rotate(-135deg);
  }

  /* ── Dossier drawer (absolute overlay — covers content area) ───── */
  .lg-passage-drawer {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    padding: 14px 20px 28px;
    pointer-events: none;
    /* subtle scrim over content behind */
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--color-void, #000) 38%, transparent) 0%,
      color-mix(in srgb, var(--color-void, #000) 12%, transparent) 60%,
      transparent 100%);
    animation: lg-passage-unfurl 0.42s cubic-bezier(0.2, 0.75, 0.25, 1);
  }
  .lg-passage-drawer > * { pointer-events: auto; }

  @keyframes lg-passage-unfurl {
    0%   { opacity: 0; transform: translateY(-12px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .lg-passage-card {
    position: relative;
    max-width: 820px;
    margin: 0 auto;
    padding: 32px 36px 30px;
    background:
      repeating-linear-gradient(
        transparent 0 34px,
        color-mix(in srgb, var(--color-fg) 3.5%, transparent) 34px 35px
      ),
      color-mix(in srgb, var(--color-elevated, var(--color-surface)) 98%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-edge) 40%, transparent);
    box-shadow:
      0 36px 90px -40px color-mix(in srgb, var(--color-void, #000) 75%, transparent),
      0 12px 30px -18px color-mix(in srgb, var(--color-void, #000) 55%, transparent);
    isolation: isolate;
    animation: lg-passage-card-in 0.5s cubic-bezier(0.16, 0.84, 0.3, 1) 0.05s backwards;
  }
  @keyframes lg-passage-card-in {
    0%   { opacity: 0; transform: translateY(-8px) scale(0.992); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  .lg-passage-card::before {
    /* inner hairline frame */
    content: "";
    position: absolute;
    inset: 8px;
    border: 1px solid color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 26%, transparent);
    pointer-events: none;
    z-index: 0;
  }
  .lg-passage-card::after {
    /* warm paper tint */
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at 30% 0%,
      color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 6%, transparent) 0%,
      transparent 60%
    );
    pointer-events: none;
    z-index: 0;
  }

  /* Corner ticks — like cartographer frame marks */
  .lg-passage-corner {
    position: absolute;
    width: 14px;
    height: 14px;
    border-color: color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 55%, transparent);
    z-index: 2;
  }
  .lg-passage-corner--tl { top: 4px; left: 4px; border-top: 1px solid; border-left: 1px solid; }
  .lg-passage-corner--tr { top: 4px; right: 4px; border-top: 1px solid; border-right: 1px solid; }
  .lg-passage-corner--bl { bottom: 4px; left: 4px; border-bottom: 1px solid; border-left: 1px solid; }
  .lg-passage-corner--br { bottom: 4px; right: 4px; border-bottom: 1px solid; border-right: 1px solid; }

  /* Meridian decoration at top center */
  .lg-passage-meridian {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
    padding: 0 10px;
    background: color-mix(in srgb, var(--color-elevated, var(--color-surface)) 98%, transparent);
  }
  .lg-passage-meridian::before,
  .lg-passage-meridian::after {
    content: "";
    position: absolute;
    top: 50%;
    width: 42px;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      var(--c, ${ILLUMINATED_COPPER}) 100%);
    opacity: 0.6;
  }
  .lg-passage-meridian::before { right: 100%; background: linear-gradient(90deg, transparent, var(--c, ${ILLUMINATED_COPPER})); }
  .lg-passage-meridian::after { left: 100%; background: linear-gradient(90deg, var(--c, ${ILLUMINATED_COPPER}), transparent); }
  .lg-passage-meridian-mark {
    font-size: 12px;
    color: var(--c, ${ILLUMINATED_COPPER});
    line-height: 1;
  }

  .lg-passage-head {
    position: relative;
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr) auto;
    column-gap: 26px;
    align-items: end;
    padding-bottom: 20px;
    z-index: 2;
  }
  .lg-passage-portrait {
    position: relative;
  }
  .lg-passage-portrait::before {
    content: "";
    position: absolute;
    inset: -6px;
    border: 1px solid color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 30%, transparent);
    pointer-events: none;
  }
  .lg-passage-portrait .lg-portrait {
    width: 104px;
    height: 104px;
    border-radius: 0;
  }
  .lg-passage-portrait .lg-portrait-img,
  .lg-passage-portrait .lg-portrait-halo,
  .lg-passage-portrait .lg-portrait-fallback {
    border-radius: 0;
  }
  .lg-passage-portrait .lg-portrait-fallback {
    font-size: 38px;
  }
  .lg-passage-title {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding-bottom: 4px;
  }
  .lg-passage-eyebrow {
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.38em;
    text-transform: uppercase;
    color: var(--color-fg-4);
  }
  .lg-passage-display {
    font-family: var(--font-family-display);
    font-size: 30px;
    line-height: 1.05;
    font-weight: 500;
    letter-spacing: -0.005em;
    color: var(--c, var(--color-fg));
    margin: 0;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  .lg-passage-rule {
    height: 1px;
    width: 56px;
    background: var(--c, var(--color-fg-3));
    opacity: 0.55;
    margin-top: 4px;
  }

  /* Circular "FILED UNDER LOG" stamp */
  .lg-passage-stamp {
    position: relative;
    align-self: start;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border: 1px solid color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 55%, transparent);
    border-radius: 999px;
    color: var(--c, ${ILLUMINATED_COPPER});
    font-family: var(--font-family-mono);
    font-size: 7.5px;
    letter-spacing: 0.22em;
    line-height: 1.1;
    text-align: center;
    opacity: 0.82;
    transform: rotate(-6deg);
    gap: 2px;
    margin-top: 4px;
  }
  .lg-passage-stamp::before {
    content: "";
    position: absolute;
    inset: 3px;
    border: 1px dashed color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 28%, transparent);
    border-radius: 999px;
    pointer-events: none;
  }
  .lg-passage-stamp-mid {
    font-size: 14px;
    letter-spacing: 0;
  }
  .lg-passage-stamp-top,
  .lg-passage-stamp-bot {
    font-weight: 600;
  }

  /* Dossier body */
  .lg-passage-body {
    position: relative;
    z-index: 2;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--color-edge) 30%, transparent);
    font-size: 14px;
    line-height: 1.85;
    color: var(--color-fg);
    word-break: keep-all;
    overflow-wrap: anywhere;
    max-height: min(62vh, 640px);
    overflow-y: auto;
    padding-right: 6px;
  }
  .lg-passage-body::-webkit-scrollbar { width: 6px; }
  .lg-passage-body::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--c, ${ILLUMINATED_COPPER}) 30%, transparent);
    border-radius: 3px;
  }
  @container (min-width: 820px) {
    .lg-passage-body {
      column-count: 2;
      column-gap: 36px;
      column-rule: 1px solid color-mix(in srgb, var(--color-edge) 24%, transparent);
    }
    .lg-passage-body h4,
    .lg-passage-body h5,
    .lg-passage-body h6 {
      column-span: all;
    }
  }
  .lg-passage-body > :first-child { margin-top: 0; }
  .lg-passage-body > :last-child { margin-bottom: 0; }
  .lg-passage-body h4,
  .lg-passage-body h5,
  .lg-passage-body h6 {
    font-family: var(--font-family-display);
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--color-fg-2);
    margin: 18px 0 6px;
    break-after: avoid;
  }
  .lg-passage-body h4 {
    font-size: 18px;
    color: var(--c, var(--color-fg));
  }
  .lg-passage-body h5 {
    font-size: 10.5px;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: var(--c, var(--color-fg-3));
    opacity: 0.88;
    position: relative;
    padding-left: 16px;
    margin-top: 20px;
  }
  .lg-passage-body h5::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 10px;
    height: 1px;
    background: currentColor;
    transform: translateY(-50%);
  }
  .lg-passage-body h6 {
    font-size: 12px;
    color: var(--color-fg-3);
  }
  .lg-passage-body p { margin: 0 0 10px; }
  .lg-passage-body ul {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .lg-passage-body li {
    position: relative;
    padding-left: 20px;
  }
  .lg-passage-body li::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 0.75em;
    width: 10px;
    height: 1px;
    background: var(--c, var(--color-fg-4));
    opacity: 0.55;
  }

  @media (max-width: 640px) {
    .lg-passage-strip { padding: 8px 16px 8px 12px; gap: 10px; }
    .lg-passage-label { font-size: 9px; letter-spacing: 0.26em; }
    .lg-passage-hint { font-size: 9px; letter-spacing: 0.22em; }
    .lg-passage-card { padding: 26px 20px 22px; }
    .lg-passage-head { grid-template-columns: 76px minmax(0, 1fr); column-gap: 18px; }
    .lg-passage-stamp { display: none; }
    .lg-passage-portrait .lg-portrait { width: 76px; height: 76px; }
    .lg-passage-display { font-size: 22px; }
  }

  .lg-item-list, .lg-quest-list {
    list-style: none;
    margin: 0;
    padding: 4px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lg-item, .lg-quest {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    grid-template-areas:
      "glyph header trailing"
      ".     desc   desc";
    align-items: baseline;
    column-gap: 8px;
    row-gap: 2px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--color-fg);
  }
  .lg-item-glyph, .lg-quest-glyph {
    grid-area: glyph;
    font-family: var(--font-family-mono);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: var(--color-fg-3);
  }
  .lg-item-name, .lg-quest-name {
    grid-area: header;
    font-weight: 500;
    min-width: 0;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  .lg-item-qty, .lg-quest-flag, .lg-item-flag {
    grid-area: trailing;
    align-self: baseline;
  }
  .lg-item-desc, .lg-quest-desc {
    grid-area: desc;
    color: var(--color-fg-3);
    font-size: 12px;
    min-width: 0;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  .lg-item-flag, .lg-quest-flag {
    font-family: var(--font-family-mono);
    font-size: 8.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    padding: 1px 7px;
    color: ${VERDIGRIS};
    background: color-mix(in srgb, ${VERDIGRIS} 10%, transparent);
    border: 1px solid color-mix(in srgb, ${VERDIGRIS} 28%, transparent);
    white-space: nowrap;
  }
  .lg-item-flag--spent, .lg-quest-flag--closed {
    color: var(--color-fg-4);
    background: transparent;
    border-color: color-mix(in srgb, var(--color-fg-4) 30%, transparent);
  }
  .lg-quest-flag--new {
    color: ${ILLUMINATED_COPPER};
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 8%, transparent);
    border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 30%, transparent);
  }
  .lg-item--expended .lg-item-name,
  .lg-item--expended .lg-item-desc {
    text-decoration: line-through;
    opacity: 0.55;
  }
  .lg-quest--closed .lg-quest-name,
  .lg-quest--closed .lg-quest-desc {
    opacity: 0.5;
  }

  /* ── Ability Scores ────────────────────────────────────────────── */
  .lg-ability-list {
    list-style: none;
    margin: 0;
    padding: 4px 20px 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;
  }
  .lg-ability {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 8px;
    align-items: baseline;
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-fg);
    padding: 4px 8px;
    border-left: 2px solid color-mix(in srgb, ${VERDIGRIS} 24%, transparent);
    background: color-mix(in srgb, ${VERDIGRIS} 4%, transparent);
  }
  .lg-ability-ko {
    font-weight: 500;
    color: var(--color-fg);
  }
  .lg-ability-mod {
    font-family: var(--font-family-mono);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: ${VERDIGRIS};
  }
  .lg-ability--strong {
    border-left-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 55%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 6%, transparent);
  }
  .lg-ability--strong .lg-ability-mod {
    color: ${ILLUMINATED_COPPER};
  }
  .lg-ability--weak {
    border-left-color: color-mix(in srgb, var(--color-fg-4) 30%, transparent);
    background: transparent;
    opacity: 0.75;
  }
  .lg-ability--weak .lg-ability-mod {
    color: var(--color-fg-4);
  }

  /* ── Margin gloss: 우측 카드가 자체 폭에 반응 ────────────────── */
  @container lg-side (max-width: 280px) {
    .lg-appendix-head { padding: 10px 14px; gap: 8px; }
    .lg-appendix-title { letter-spacing: 0.14em; }
    .lg-item-list, .lg-quest-list { padding: 4px 14px 14px; }
    .lg-ability-list {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      padding: 4px 14px 14px;
    }
    .lg-item-desc, .lg-quest-desc {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
  @container lg-side (max-width: 220px) {
    .lg-appendix-title { font-size: 0; letter-spacing: 0; }
    .lg-appendix-title::before {
      content: attr(data-short);
      font-family: var(--font-family-display);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-fg-2);
    }
    .lg-appendix-head { padding: 8px 12px; }
    .lg-item-qty,
    .lg-quest-flag,
    .lg-item-flag { display: none; }
    .lg-quest--pursuing .lg-quest-glyph { color: ${ILLUMINATED_COPPER}; }
    .lg-item--expended .lg-item-glyph { opacity: 0.4; }
    .lg-item, .lg-quest {
      grid-template-columns: 14px minmax(0, 1fr);
      grid-template-areas:
        "glyph header"
        ".     desc";
    }
    .lg-ability {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "mod"
        "ko";
      row-gap: 0;
      padding: 6px 8px;
      text-align: center;
    }
    .lg-ability-mod {
      grid-area: mod;
      font-size: 16px;
    }
    .lg-ability-ko {
      grid-area: ko;
      font-size: 10px;
      letter-spacing: 0.08em;
      color: var(--color-fg-3);
    }
    .lg-item-list, .lg-quest-list, .lg-ability-list { padding: 4px 10px 12px; }
  }

  /* ── Empty state: Uncharted Shores ────────────────────────────── */
  /* ── Empty State · Moonhaven Customs Form ────────────────── */
  .lg-customs {
    --form-ink: #4a3318;
    --form-ink-soft: color-mix(in srgb, #4a3318 55%, transparent);
    --form-ink-faint: color-mix(in srgb, #4a3318 22%, transparent);
    --form-paper: #fcf3dd;
    --form-paper-edge: #c8ad77;

    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 22px 64px;
    min-height: 100%;
    background:
      radial-gradient(ellipse at 18% 0%, color-mix(in srgb, ${ILLUMINATED_COPPER} 9%, transparent) 0%, transparent 55%),
      radial-gradient(ellipse at 82% 100%, color-mix(in srgb, ${VERDIGRIS} 7%, transparent) 0%, transparent 55%);
  }
  .lg-customs-paper {
    position: relative;
    width: 100%;
    max-width: 560px;
    padding: 28px 36px 30px 64px;
    background:
      repeating-linear-gradient(to bottom, transparent 0, transparent 31px, color-mix(in srgb, var(--form-ink) 5%, transparent) 31px, color-mix(in srgb, var(--form-ink) 5%, transparent) 32px),
      linear-gradient(168deg, #fff7e1 0%, #fbedc6 100%);
    border: 1px solid var(--form-paper-edge);
    box-shadow:
      0 24px 40px -16px rgba(60, 36, 12, 0.28),
      0 1px 0 #fff inset,
      0 -1px 0 color-mix(in srgb, var(--form-ink) 8%, transparent) inset;
    color: var(--form-ink);
    font-family: var(--font-family-body);
    transform-origin: 60% 30%;
    animation: lg-customs-arrive 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes lg-customs-arrive {
    from { opacity: 0; transform: translateX(22px) translateY(6px) rotate(1.4deg); }
    to   { opacity: 1; transform: translateX(0) translateY(0) rotate(0); }
  }
  .lg-customs-perforation {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 36px;
    background:
      radial-gradient(circle at 18px 36px,  color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 96px,  color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 156px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 216px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 276px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 336px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 396px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 456px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 516px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      radial-gradient(circle at 18px 576px, color-mix(in srgb, var(--form-ink) 88%, transparent) 4px, transparent 4.5px),
      color-mix(in srgb, var(--form-paper-edge) 30%, transparent);
    border-right: 1px dashed color-mix(in srgb, var(--form-ink) 38%, transparent);
  }

  /* Header */
  .lg-customs-head {
    display: grid;
    grid-template-columns: 64px 1fr auto;
    gap: 14px 18px;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 2px double color-mix(in srgb, var(--form-ink) 45%, transparent);
  }
  .lg-customs-seal {
    width: 64px;
    height: 64px;
    animation: lg-customs-fade-in 0.5s 0.15s ease-out both;
  }
  .lg-customs-seal-outer { fill: none; stroke: var(--form-ink); stroke-width: 1.4; }
  .lg-customs-seal-inner { fill: none; stroke: var(--form-ink); stroke-width: 0.6; opacity: 0.55; }
  .lg-customs-seal-tower { fill: none; stroke: var(--form-ink); stroke-width: 1.1; stroke-linejoin: round; }
  .lg-customs-seal-room  { fill: none; stroke: var(--form-ink); stroke-width: 1.1; }
  .lg-customs-seal-roof  { fill: var(--form-ink); }
  .lg-customs-seal-base  { stroke: var(--form-ink); stroke-width: 0.8; opacity: 0.5; }
  .lg-customs-seal-beam {
    fill: ${ILLUMINATED_COPPER};
    filter: drop-shadow(0 0 3px ${ILLUMINATED_COPPER});
    animation: lg-customs-beam 2.4s ease-in-out infinite;
  }
  .lg-customs-seal-ticks {
    transform-box: fill-box;
    transform-origin: center;
    animation: lg-customs-spin 32s linear infinite;
  }
  .lg-customs-seal-ticks line {
    stroke: var(--form-ink);
    stroke-width: 1;
    stroke-linecap: round;
    opacity: 0.65;
  }
  @keyframes lg-customs-beam {
    0%, 100% { opacity: 0.45; }
    50%      { opacity: 1; }
  }
  @keyframes lg-customs-spin {
    to { transform: rotate(360deg); }
  }

  .lg-customs-head-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    animation: lg-customs-fade-in 0.5s 0.22s ease-out both;
  }
  .lg-customs-authority {
    font-family: var(--font-family-display);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--form-ink);
  }
  .lg-customs-title {
    font-family: var(--font-family-display);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--form-ink);
  }
  .lg-customs-subtitle {
    font-family: var(--font-family-body);
    font-size: 10.5px;
    font-style: italic;
    color: var(--form-ink-soft);
    letter-spacing: 0.08em;
  }
  .lg-customs-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding: 6px 10px 6px 14px;
    border-left: 1px solid color-mix(in srgb, var(--form-ink) 25%, transparent);
    animation: lg-customs-stamp-in 0.5s 0.55s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  }
  .lg-customs-meta-row {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.16em;
  }
  .lg-customs-meta-label {
    color: var(--form-ink-soft);
    font-weight: 600;
    text-transform: uppercase;
  }
  .lg-customs-regno, .lg-customs-folio {
    color: var(--form-ink);
    font-weight: 600;
  }
  @keyframes lg-customs-stamp-in {
    from { opacity: 0; transform: scale(1.4) rotate(-6deg); }
    to   { opacity: 1; transform: scale(1) rotate(-2deg); }
  }

  /* Instruction line */
  .lg-customs-instruction {
    margin: 16px 0 18px;
    font-size: 12.5px;
    font-style: italic;
    color: var(--form-ink-soft);
    letter-spacing: 0.02em;
    line-height: 1.55;
  }
  .lg-customs-instruction-mark {
    display: inline-block;
    margin-right: 6px;
    font-weight: 700;
    color: ${ILLUMINATED_COPPER};
    font-style: normal;
    font-size: 14px;
    vertical-align: -1px;
  }

  /* Form */
  .lg-customs-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .lg-customs-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lg-customs-section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    padding-bottom: 4px;
    font-family: var(--font-family-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--form-ink);
    border-bottom: 1px solid color-mix(in srgb, var(--form-ink) 24%, transparent);
  }
  .lg-customs-section-no {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px; height: 22px;
    border: 1px solid var(--form-ink);
    font-family: var(--font-family-display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
  }

  /* Form rows (stats) */
  .lg-customs-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }
  .lg-customs-row {
    display: grid;
    grid-template-columns: minmax(80px, auto) 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 6px 4px;
    animation: lg-customs-row-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(0.3s + var(--row-i, 0) * 0.06s);
  }
  @keyframes lg-customs-row-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .lg-customs-row-label {
    font-family: var(--font-family-display);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--form-ink);
  }
  .lg-customs-row-leader {
    border-bottom: 1.5px dotted color-mix(in srgb, var(--form-ink) 40%, transparent);
    margin-bottom: 4px;
    align-self: end;
    height: 0;
  }
  .lg-customs-stepper {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .lg-customs-step {
    position: relative;
    width: 28px; height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 38% 30%, #fff8e0 0%, color-mix(in srgb, ${ILLUMINATED_COPPER} 22%, var(--form-paper)) 85%);
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 55%, var(--form-ink));
    border-radius: 50%;
    color: var(--form-ink);
    font-family: var(--font-family-mono);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    box-shadow:
      0 2px 0 color-mix(in srgb, var(--form-ink) 22%, transparent),
      0 1px 0 #fff inset;
    transition: transform 0.14s ease, box-shadow 0.18s ease, opacity 0.2s ease;
  }
  .lg-customs-step:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow:
      0 3px 0 color-mix(in srgb, var(--form-ink) 24%, transparent),
      0 1px 0 #fff inset;
  }
  .lg-customs-step:active:not(:disabled) {
    transform: translateY(1px);
    box-shadow:
      0 0 0 color-mix(in srgb, var(--form-ink) 22%, transparent),
      0 1px 0 #fff inset;
  }
  .lg-customs-step:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .lg-customs-value {
    display: inline-block;
    min-width: 32px;
    text-align: center;
    font-family: var(--font-family-mono);
    font-size: 16px;
    font-weight: 700;
    color: var(--form-ink);
    transform-origin: center;
  }
  .lg-customs-value--bump {
    animation: lg-customs-value-bump 0.32s cubic-bezier(0.4, 1.6, 0.6, 1);
  }
  @keyframes lg-customs-value-bump {
    0%   { transform: translateY(0) rotate(0); }
    35%  { transform: translateY(-3px) rotate(-4deg); }
    65%  { transform: translateY(0) rotate(3deg); }
    100% { transform: translateY(0) rotate(0); }
  }

  /* Total bar with stamp */
  .lg-customs-totalbar {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 18px;
    padding: 14px 18px;
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--form-ink) 18%, transparent);
  }
  .lg-customs-total {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
  }
  .lg-customs-total-label {
    font-family: var(--font-family-display);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--form-ink-soft);
  }
  .lg-customs-total-value {
    font-family: var(--font-family-mono);
    font-size: 24px;
    font-weight: 700;
    color: var(--form-ink-soft);
    transition: color 0.3s ease;
  }
  .lg-customs-total[data-state="ok"] .lg-customs-total-value {
    color: ${VERDIGRIS};
  }
  .lg-customs-total[data-state="over"] .lg-customs-total-value {
    color: ${VERMILION};
  }
  .lg-customs-total-target {
    font-family: var(--font-family-mono);
    font-size: 14px;
    color: var(--form-ink-soft);
    letter-spacing: 0.06em;
  }
  .lg-customs-stamp {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 130px;
    height: 56px;
    border: 2.5px solid color-mix(in srgb, ${VERMILION} 55%, transparent);
    border-radius: 4px;
    color: color-mix(in srgb, ${VERMILION} 78%, transparent);
    font-family: var(--font-family-display);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    text-align: center;
    transform: rotate(-4deg);
    transition: border-color 0.4s ease, color 0.4s ease, transform 0.4s cubic-bezier(0.4, 1.6, 0.4, 1);
  }
  .lg-customs-total[data-state="ok"] + .lg-customs-stamp {
    border-color: ${VERDIGRIS};
    color: ${VERDIGRIS};
    transform: rotate(-2deg) scale(1.06);
    animation: lg-customs-stamp-down 0.45s cubic-bezier(0.2, 0.8, 0.3, 1.4);
  }
  @keyframes lg-customs-stamp-down {
    0%   { transform: rotate(8deg) scale(1.6); opacity: 0; }
    50%  { transform: rotate(-6deg) scale(0.94); opacity: 1; }
    100% { transform: rotate(-2deg) scale(1.06); opacity: 1; }
  }
  .lg-customs-stamp-inner {
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.15;
  }
  .lg-customs-stamp-line { display: none; }
  .lg-customs-stamp [data-stamp-pending] { display: block; }
  .lg-customs-total[data-state="ok"] + .lg-customs-stamp [data-stamp-pending] { display: none; }
  .lg-customs-total[data-state="ok"] + .lg-customs-stamp [data-stamp-approved] { display: block; }

  /* Signature */
  .lg-customs-sig {
    position: relative;
    padding: 4px 0 22px;
  }
  .lg-customs-sig-input {
    width: 100%;
    padding: 8px 4px;
    background: transparent;
    border: none;
    outline: none;
    color: var(--form-ink);
    font-family: var(--font-family-display);
    font-size: 18px;
    font-weight: 500;
    letter-spacing: 0.04em;
  }
  .lg-customs-sig-input::placeholder {
    color: color-mix(in srgb, var(--form-ink) 32%, transparent);
    font-style: italic;
    font-weight: 400;
  }
  .lg-customs-sig-line {
    display: block;
    position: relative;
    height: 1px;
    background: color-mix(in srgb, var(--form-ink) 30%, transparent);
  }
  .lg-customs-sig-line::after {
    content: "";
    position: absolute;
    inset: 0 100% 0 0;
    background: var(--form-ink);
    transition: inset 0.42s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .lg-customs-sig[data-focused="1"] .lg-customs-sig-line::after {
    inset: 0 0 0 0;
  }
  .lg-customs-sig-caption {
    display: block;
    margin-top: 5px;
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--form-ink-soft);
  }

  .lg-customs-error {
    margin: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, ${VERMILION} 8%, transparent);
    border-left: 3px solid ${VERMILION};
    font-family: var(--font-family-body);
    font-size: 12px;
    color: ${VERMILION};
    letter-spacing: 0.02em;
  }

  /* Submit (entry stamp) */
  .lg-customs-submit {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 20px;
    margin-top: 4px;
    background: linear-gradient(180deg, color-mix(in srgb, ${VERDIGRIS} 14%, transparent) 0%, color-mix(in srgb, ${VERDIGRIS} 24%, transparent) 100%);
    border: 1.5px solid color-mix(in srgb, ${VERDIGRIS} 65%, transparent);
    color: ${VERDIGRIS};
    font-family: var(--font-family-display);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), background 0.25s ease, border-color 0.25s ease, opacity 0.25s ease, color 0.25s ease;
  }
  .lg-customs-submit:hover:not(:disabled) {
    transform: translateY(-2px);
    background: linear-gradient(180deg, color-mix(in srgb, ${VERDIGRIS} 20%, transparent) 0%, color-mix(in srgb, ${VERDIGRIS} 32%, transparent) 100%);
  }
  .lg-customs-submit:active:not(:disabled) {
    transform: translateY(2px) scale(0.98);
  }
  .lg-customs-submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    background: transparent;
    color: color-mix(in srgb, var(--form-ink) 45%, transparent);
    border-color: color-mix(in srgb, var(--form-ink) 24%, transparent);
  }
  .lg-customs-submit-text {
    flex: 1;
    text-align: left;
  }
  .lg-customs-submit-mark {
    width: 28px; height: 28px;
    flex-shrink: 0;
  }
  .lg-customs-submit-mark-ring {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .lg-customs-submit-mark-check {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 22;
    stroke-dashoffset: 22;
    transition: stroke-dashoffset 0.4s ease 0.05s;
  }
  .lg-customs-submit:not(:disabled) .lg-customs-submit-mark-check {
    stroke-dashoffset: 0;
  }

  @keyframes lg-customs-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Animations ──────────────────────────────────────────────── */
  @keyframes lg-rise {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes lg-settle {
    0%   { opacity: 0; transform: rotate(var(--tilt, 0deg)) translateY(-12px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes lg-ink {
    0%   { opacity: 0; transform: scale(0.94) rotate(-0.4deg); filter: blur(2px); }
    100% { opacity: 1; transform: scale(1) rotate(-0.4deg); filter: blur(0); }
  }

  /* ── Responsive ──────────────────────────────────────────────── */
  @media (max-width: 720px) {
    .lg-reel { padding: 18px 16px 24px; gap: 22px; }
    .lg-header, .lg-header--empty { padding: 10px 16px; }
    .lg-header-row--bottom {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
    .lg-vitals {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
    .lg-vital-bar { flex: 1; width: auto; }
    .lg-plate-dialogue { grid-template-columns: 56px minmax(0, 1fr); gap: 14px; }
    .lg-portrait { width: 56px; height: 56px; }
    .lg-whisper { max-width: 82%; font-size: 14.5px; }
  }

  /* ── Next Choices (선택지 버튼) ───────────────────────────────── */
  .lg-choice {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    margin-top: 4px;
    background: color-mix(in srgb, #b36b2a 3%, var(--color-surface, #f6ecd2));
    border: 1px solid color-mix(in srgb, #b36b2a 22%, transparent);
    border-radius: 4px;
    box-shadow: 0 1px 0 color-mix(in srgb, #3d2a15 6%, transparent);
  }
  .lg-choice-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .lg-choice-glyph {
    color: #b36b2a;
    font-size: 14px;
  }
  .lg-choice-title {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-fg-2, #5a4530);
  }
  .lg-choice-hint {
    font-size: 11px;
    color: var(--color-fg-3, #8a6e4d);
    font-style: italic;
  }
  .lg-choice-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lg-choice-option {
    appearance: none;
    -webkit-appearance: none;
    text-align: left;
    width: 100%;
    cursor: pointer;
    padding: 12px 16px;
    background: color-mix(in srgb, #b36b2a 2%, var(--color-elevated, #fff8e4));
    border: 1px solid color-mix(in srgb, #b36b2a 18%, transparent);
    border-radius: 3px;
    color: var(--color-fg, #2d2015);
    font-family: inherit;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    animation: lg-choice-rise 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) backwards;
    animation-delay: calc(var(--i, 0) * 0.06s);
  }
  .lg-choice-option:hover {
    background: color-mix(in srgb, #b36b2a 8%, var(--color-elevated, #fff8e4));
    border-color: color-mix(in srgb, #b36b2a 38%, transparent);
  }
  .lg-choice-option:active {
    transform: translateY(1px);
  }
  .lg-choice-label {
    font-size: 14.5px;
    line-height: 1.4;
    flex: 1 1 auto;
  }
  .lg-choice-meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-shrink: 0;
  }
  .lg-choice-stat,
  .lg-choice-dc {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-fg-3, #8a6e4d);
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, #3d2a15 18%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, #fff 35%, transparent);
  }
  .lg-choice-dc {
    color: #b36b2a;
    border-color: color-mix(in srgb, #b36b2a 28%, transparent);
  }
  @keyframes lg-choice-rise {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Scriptorium Ritual (스트리밍 중 시각 피드백) ─────────── */
  .lg-ritual {
    position: sticky;
    bottom: 14px;
    margin: 14px auto 0;
    max-width: 520px;
    padding: 14px 18px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background:
      radial-gradient(ellipse at 50% -20%, color-mix(in srgb, #b36b2a 7%, transparent), transparent 55%),
      color-mix(in srgb, #b36b2a 5%, var(--color-elevated, #fff8e4));
    border: 1px solid color-mix(in srgb, #b36b2a 28%, transparent);
    border-radius: 4px;
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #fff 35%, transparent),
      0 10px 28px -12px color-mix(in srgb, #3d2a15 35%, transparent);
    z-index: 5;
    overflow: hidden;
    animation: lg-ritual-fade 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .lg-ritual[hidden] { display: none; }

  /* decorative corner flourishes */
  .lg-ritual::before,
  .lg-ritual::after {
    content: "";
    position: absolute;
    top: 6px;
    width: 22px;
    height: 22px;
    pointer-events: none;
    opacity: 0.5;
    background-repeat: no-repeat;
    background-size: 100% 100%;
    background-image: linear-gradient(
      45deg,
      transparent calc(50% - 0.6px),
      color-mix(in srgb, #b36b2a 45%, transparent) calc(50% - 0.6px),
      color-mix(in srgb, #b36b2a 45%, transparent) calc(50% + 0.6px),
      transparent calc(50% + 0.6px)
    );
  }
  .lg-ritual::before { left: 6px; transform: scaleX(-1); }
  .lg-ritual::after  { right: 6px; }

  .lg-ritual-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 300 / 140;
    border-radius: 3px;
    background:
      radial-gradient(circle at 50% 0%, color-mix(in srgb, #fff 80%, transparent), transparent 65%),
      color-mix(in srgb, #fff 22%, var(--color-elevated, #fff8e4));
    border: 1px solid color-mix(in srgb, #b36b2a 20%, transparent);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, #fff 25%, transparent),
      inset 0 -20px 40px -30px color-mix(in srgb, #b36b2a 40%, transparent);
    overflow: hidden;
  }
  .lg-ritual-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Default: hide all scenes; tool-specific selectors below reveal one. */
  .lg-ritual .rscene {
    opacity: 0;
    transition: opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }
  .lg-ritual[data-tool="thinking"] .rscene-thinking,
  .lg-ritual[data-tool="script"] .rscene-script,
  .lg-ritual[data-tool="read"] .rscene-read,
  .lg-ritual[data-tool="grep"] .rscene-grep,
  .lg-ritual[data-tool="write"] .rscene-write,
  .lg-ritual[data-tool="append"] .rscene-append,
  .lg-ritual[data-tool="edit"] .rscene-edit,
  .lg-ritual[data-tool="tree"] .rscene-tree,
  .lg-ritual[data-tool="activate_skill"] .rscene-activate_skill {
    opacity: 1;
  }

  /* ── Scene styles ────────────────────────────────────────── */
  /* All strokes/fills source from the ritual ink color. Combat mode below
     overrides --rink to the candlelight gold. */
  .lg-ritual {
    --rink: #6a4f2d;
    --rink-strong: #3d2a15;
    --rink-soft: color-mix(in srgb, #6a4f2d 60%, transparent);
    --rink-faint: color-mix(in srgb, #6a4f2d 24%, transparent);
    --rink-bg: #fff8e4;
    --rink-accent: #b36b2a;
  }

  /* Inkwell (thinking) */
  .rs-pot {
    fill: color-mix(in srgb, var(--rink-strong) 80%, transparent);
    stroke: var(--rink-strong);
    stroke-width: 1.2;
  }
  .rs-pot-rim {
    fill: color-mix(in srgb, var(--rink-strong) 50%, transparent);
    stroke: var(--rink-strong);
    stroke-width: 0.8;
  }
  .rs-ink {
    fill: var(--rink-strong);
  }
  .rs-shadow {
    fill: color-mix(in srgb, var(--rink-strong) 18%, transparent);
  }
  .rs-ripple {
    fill: none;
    stroke: var(--rink-accent);
    stroke-width: 1;
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-ripple 2.6s ease-out infinite;
  }
  .rs-ripple-2 { animation-delay: -0.85s; }
  .rs-ripple-3 { animation-delay: -1.7s; }
  @keyframes rs-ripple {
    0%   { transform: scale(0.4); opacity: 0.55; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  .rs-vapor {
    fill: none;
    stroke: var(--rink-soft);
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-dasharray: 70;
    stroke-dashoffset: 70;
    animation: rs-vapor 3.4s ease-in-out infinite;
  }
  @keyframes rs-vapor {
    0%   { stroke-dashoffset: 70; opacity: 0; }
    35%  { opacity: 0.7; }
    80%  { opacity: 0.2; }
    100% { stroke-dashoffset: 0; opacity: 0; }
  }

  /* Read (page) */
  .rs-page {
    fill: color-mix(in srgb, #fff 18%, var(--rink-bg));
    stroke: var(--rink);
    stroke-width: 1.1;
  }
  .rs-spine {
    stroke: var(--rink-strong);
    stroke-width: 1.2;
    fill: none;
  }
  .rs-line {
    stroke: var(--rink);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-dasharray: 24;
    stroke-dashoffset: 24;
    animation: rs-line-draw 2.4s ease-out infinite;
  }
  .rs-line-1, .rs-line-4 { animation-delay: 0s; }
  .rs-line-2, .rs-line-5 { animation-delay: 0.4s; }
  .rs-line-3, .rs-line-6 { animation-delay: 0.8s; }
  @keyframes rs-line-draw {
    0%   { stroke-dashoffset: 24; opacity: 0; }
    20%  { opacity: 1; }
    60%  { stroke-dashoffset: 0; opacity: 1; }
    90%  { opacity: 0.7; }
    100% { stroke-dashoffset: 0; opacity: 0; }
  }

  /* Grep (magnifier) */
  .rs-grep-line {
    stroke: var(--rink-faint);
    stroke-width: 1.2;
    stroke-linecap: round;
  }
  .rs-grep-hit {
    fill: var(--rink-accent);
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-grep-flash 2.4s ease-in-out infinite;
  }
  .rs-grep-hit-1 { animation-delay: 0.4s; }
  .rs-grep-hit-2 { animation-delay: 1.05s; }
  .rs-grep-hit-3 { animation-delay: 1.6s; }
  @keyframes rs-grep-flash {
    0%, 100% { opacity: 0; transform: scale(0.6); }
    20%      { opacity: 1; transform: scale(1.5); }
    50%      { opacity: 0.6; transform: scale(1); }
  }
  .rs-lens {
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-lens-pan 2.4s ease-in-out infinite;
  }
  .rs-lens-ring {
    fill: none;
    stroke: var(--rink-strong);
    stroke-width: 1.6;
  }
  .rs-lens-glass {
    fill: color-mix(in srgb, #fff 35%, transparent);
    stroke: var(--rink);
    stroke-width: 0.6;
  }
  .rs-lens-handle {
    stroke: var(--rink-strong);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  @keyframes rs-lens-pan {
    0%   { transform: translate(28px, 30px); }
    50%  { transform: translate(78px, 60px); }
    100% { transform: translate(28px, 30px); }
  }

  /* Write (quill + parchment) */
  .rs-parchment {
    fill: color-mix(in srgb, #fff 22%, var(--rink-bg));
    stroke: var(--rink-faint);
    stroke-width: 0.8;
  }
  .rs-write-line {
    stroke: var(--rink);
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    animation: rs-line-draw 2.6s ease-out infinite;
  }
  .rs-write-line-2 { animation-delay: 0.55s; }
  .rs-write-line-3 { animation-delay: 1.1s; }
  .rs-quill {
    transform-box: fill-box;
    transform-origin: 80px 60px;
    animation: rs-quill-bob 2.6s ease-in-out infinite;
  }
  .rs-quill-feather {
    fill: color-mix(in srgb, var(--rink) 30%, transparent);
    stroke: var(--rink-strong);
    stroke-width: 0.8;
  }
  .rs-quill-shaft {
    stroke: var(--rink-strong);
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .rs-quill-tip {
    fill: var(--rink-strong);
  }
  .rs-quill-drop {
    fill: var(--rink-accent);
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-drop 2.6s ease-in infinite;
  }
  @keyframes rs-quill-bob {
    0%, 100% { transform: translate(0, 0) rotate(-2deg); }
    50%      { transform: translate(-6px, 4px) rotate(3deg); }
  }
  @keyframes rs-drop {
    0%, 60%  { opacity: 0; transform: translateY(-2px) scale(0.8); }
    70%      { opacity: 1; transform: translateY(0) scale(1); }
    95%      { opacity: 0.4; transform: translateY(8px) scale(1.4); }
    100%     { opacity: 0; transform: translateY(10px) scale(1.6); }
  }

  /* Append (continue scroll · dog-eared page + caret) */
  .rs-append-fold {
    fill: color-mix(in srgb, var(--rink) 14%, var(--rink-bg));
    stroke: var(--rink-faint);
    stroke-width: 0.6;
    stroke-linejoin: round;
  }
  .rs-append-old {
    stroke: var(--rink);
    stroke-width: 1;
    stroke-linecap: round;
    opacity: 0.42;
  }
  .rs-append-old-2 { opacity: 0.5; }
  .rs-append-old-4 { opacity: 0.46; }
  .rs-append-caret {
    fill: none;
    stroke: var(--rink-accent);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: rs-append-blink 1.05s steps(2, end) infinite;
  }
  .rs-append-drop {
    fill: var(--rink-accent);
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-append-drop 3.6s ease-in infinite;
  }
  .rs-append-new {
    stroke: var(--rink-strong);
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-dasharray: 160;
    stroke-dashoffset: 160;
    animation: rs-append-grow 3.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes rs-append-blink {
    0%, 49%   { opacity: 1; }
    50%, 100% { opacity: 0.18; }
  }
  @keyframes rs-append-drop {
    0%, 14%  { opacity: 0; transform: translateY(-22px) scale(0.55); }
    24%      { opacity: 1; transform: translateY(0) scale(1); }
    34%      { opacity: 0.85; transform: translateY(4px) scale(1.4); }
    42%      { opacity: 0; transform: translateY(6px) scale(1.7); }
    100%     { opacity: 0; transform: translateY(6px) scale(1.7); }
  }
  @keyframes rs-append-grow {
    0%, 30%  { stroke-dashoffset: 160; opacity: 0.85; }
    85%      { stroke-dashoffset: 0; opacity: 1; }
    100%     { stroke-dashoffset: 0; opacity: 0.7; }
  }

  /* Edit (erase + rewrite) */
  .rs-edit-line {
    stroke: var(--rink);
    stroke-width: 1.2;
    stroke-linecap: round;
  }
  .rs-edit-old-1 { opacity: 0.6; animation: rs-edit-fade 3.2s ease-in-out infinite; }
  .rs-edit-old-2 { opacity: 0.6; animation: rs-edit-fade 3.2s ease-in-out infinite 0.5s; }
  .rs-edit-strike {
    stroke: var(--rink-accent);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    animation: rs-edit-strike 3.2s ease-in-out infinite;
  }
  .rs-edit-new {
    stroke: var(--rink-strong);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    animation: rs-edit-new 3.2s ease-out infinite;
  }
  @keyframes rs-edit-fade {
    0%, 30% { opacity: 0.6; }
    50%     { opacity: 0.15; }
    100%    { opacity: 0.6; }
  }
  @keyframes rs-edit-strike {
    0%, 30% { stroke-dashoffset: 60; }
    50%     { stroke-dashoffset: 0; opacity: 1; }
    80%     { opacity: 0.4; }
    100%    { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes rs-edit-new {
    0%, 60%  { stroke-dashoffset: 60; opacity: 0; }
    70%      { opacity: 1; }
    100%     { stroke-dashoffset: 0; opacity: 1; }
  }

  /* Tree (compass) */
  .rs-compass-ring, .rs-compass-inner {
    fill: none;
    stroke: var(--rink);
    stroke-width: 1.4;
  }
  .rs-compass-inner { stroke-width: 0.8; opacity: 0.5; }
  .rs-compass-rose {
    fill: color-mix(in srgb, var(--rink) 22%, transparent);
    stroke: var(--rink-strong);
    stroke-width: 0.8;
  }
  .rs-compass-mark {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 7px;
    fill: var(--rink-strong);
    font-weight: 600;
  }
  .rs-compass {
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-compass-rotate 22s linear infinite;
  }
  .rs-needle {
    transform-box: fill-box;
    transform-origin: 60px 60px;
    animation: rs-needle-wobble 1.8s ease-in-out infinite;
  }
  .rs-needle-shape {
    fill: var(--rink-accent);
    stroke: var(--rink-strong);
    stroke-width: 0.6;
  }
  .rs-compass-pivot {
    fill: var(--rink-strong);
  }
  @keyframes rs-compass-rotate {
    from { transform: rotate(0); }
    to   { transform: rotate(360deg); }
  }
  @keyframes rs-needle-wobble {
    0%, 100% { transform: rotate(-12deg); }
    50%      { transform: rotate(8deg); }
  }

  /* Activate skill (sigil) */
  .rs-sigil-outer, .rs-sigil-inner {
    fill: none;
    stroke: var(--rink-accent);
    stroke-width: 1.6;
    stroke-dasharray: 220;
    stroke-dashoffset: 220;
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-sigil-draw 3.2s ease-in-out infinite;
  }
  .rs-sigil-inner {
    stroke-width: 1;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
    animation-delay: 0.3s;
    animation-duration: 3.2s;
    animation-name: rs-sigil-draw-inner;
  }
  .rs-sigil-star {
    fill: none;
    stroke: var(--rink-strong);
    stroke-width: 1.2;
    stroke-linejoin: round;
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-sigil-rotate 12s linear infinite;
  }
  .rs-sigil-core {
    fill: var(--rink-accent);
    transform-box: fill-box;
    transform-origin: center;
    animation: rs-sigil-pulse 1.6s ease-in-out infinite;
  }
  @keyframes rs-sigil-draw {
    0%   { stroke-dashoffset: 220; opacity: 0.3; }
    50%  { stroke-dashoffset: 0; opacity: 1; }
    80%  { stroke-dashoffset: 0; opacity: 0.7; }
    100% { stroke-dashoffset: -220; opacity: 0; }
  }
  @keyframes rs-sigil-draw-inner {
    0%   { stroke-dashoffset: 140; opacity: 0.2; }
    50%  { stroke-dashoffset: 0; opacity: 0.9; }
    100% { stroke-dashoffset: -140; opacity: 0; }
  }
  @keyframes rs-sigil-rotate {
    from { transform: rotate(0); }
    to   { transform: rotate(360deg); }
  }
  @keyframes rs-sigil-pulse {
    0%, 100% { transform: scale(0.85); opacity: 0.7; }
    50%      { transform: scale(1.4); opacity: 1; }
  }

  /* Dice (script) */
  .rdie-face {
    fill: color-mix(in srgb, #fff 70%, var(--rink-bg));
    stroke: var(--rink-strong);
    stroke-width: 1.4;
    filter: drop-shadow(0 1px 0 color-mix(in srgb, var(--rink-strong) 30%, transparent));
  }
  .rdie-text {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 14px;
    font-weight: 700;
    fill: var(--rink-strong);
  }
  .rdie-spin {
    transform-box: fill-box;
    transform-origin: center;
  }
  .lg-ritual[data-state="busy"] .rdie-spin {
    animation: rdie-tumble var(--ddur, 1s) cubic-bezier(0.4, 0.1, 0.6, 0.9) infinite;
    animation-delay: var(--ddly, 0s);
  }
  .lg-ritual[data-state="busy"] .rdie-text {
    animation: rdie-flicker calc(var(--ddur, 1s) * 0.4) ease-in-out infinite;
  }
  .lg-ritual[data-state="settled"] .rdie-spin {
    animation: rdie-settle 0.55s cubic-bezier(0.5, 1.4, 0.3, 1) both;
  }
  .lg-ritual[data-state="settled"] .rdie-face {
    fill: color-mix(in srgb, var(--rink-accent) 14%, var(--rink-bg));
  }
  @keyframes rdie-tumble {
    0%   { transform: rotate(0deg) scale(1); }
    25%  { transform: rotate(120deg) scale(0.92, 1.08); }
    50%  { transform: rotate(240deg) scale(1.08, 0.92); }
    75%  { transform: rotate(360deg) scale(0.95, 1.05); }
    100% { transform: rotate(480deg) scale(1); }
  }
  @keyframes rdie-flicker {
    0%, 100% { opacity: 0.35; }
    50%      { opacity: 0.85; }
  }
  @keyframes rdie-settle {
    0%   { transform: rotate(720deg) scale(0.7); }
    60%  { transform: rotate(40deg) scale(1.18); }
    100% { transform: rotate(0deg) scale(1); }
  }
  .rdie-overflow {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 11px;
    fill: var(--rink);
    font-style: italic;
  }

  /* DC target ring (left of dice) */
  .rdc-target {
    opacity: 0.9;
  }
  .rdc-ring {
    fill: none;
    stroke: var(--rink);
    stroke-width: 1.2;
    stroke-dasharray: 4 3;
    transform-box: fill-box;
    transform-origin: center;
    animation: rdc-ring-turn 18s linear infinite;
  }
  .rdc-ring-inner {
    stroke-width: 0.8;
    opacity: 0.6;
    animation-duration: 12s;
    animation-direction: reverse;
  }
  @keyframes rdc-ring-turn {
    from { transform: rotate(0); }
    to   { transform: rotate(360deg); }
  }
  .rdc-label {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 8px;
    letter-spacing: 0.18em;
    fill: var(--rink);
    font-weight: 600;
  }
  .rdc-value {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 18px;
    font-weight: 700;
    fill: var(--rink-strong);
  }
  .lg-ritual[data-state="settled"] .rdc-ring {
    stroke: var(--rink-accent);
  }

  /* Modifier inscription (right of dice) */
  .rdc-mod {
    opacity: 0.85;
  }
  .rdc-mod-sign {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 22px;
    font-weight: 700;
    fill: var(--rink-accent);
  }
  .rdc-mod-value {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 18px;
    font-weight: 700;
    fill: var(--rink-strong);
  }
  .rdc-mod-label {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 7.5px;
    letter-spacing: 0.18em;
    fill: var(--rink);
  }

  /* Dice verdict overlay (settled) — dominant reveal */
  .lg-dice-verdict {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    pointer-events: none;
    opacity: 0;
  }
  .lg-ritual[data-state="settled"] .lg-dice-verdict {
    animation: lg-dice-verdict-in 0.5s 0.55s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }
  .lg-ritual[data-state="settled"] .rscene-script {
    animation: rscene-dim 0.5s 0.55s ease-out both;
  }
  @keyframes rscene-dim {
    to { opacity: 0.18; }
  }
  @keyframes lg-dice-verdict-in {
    from { opacity: 0; backdrop-filter: blur(0); }
    to   { opacity: 1; backdrop-filter: blur(1px); }
  }
  .lg-dice-total {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 68px;
    font-weight: 700;
    color: var(--rink-strong);
    line-height: 1;
    text-shadow:
      0 1px 0 color-mix(in srgb, #fff 50%, transparent),
      0 4px 14px color-mix(in srgb, var(--rink-accent) 35%, transparent);
    animation: lg-dice-total-pop 0.5s 0.55s cubic-bezier(0.2, 1.3, 0.3, 1) both;
  }
  @keyframes lg-dice-total-pop {
    from { transform: scale(0.4); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
  }
  .lg-dice-stamp {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 14px;
    border: 2px solid;
    border-radius: 3px;
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    line-height: 1.1;
    transform: rotate(-8deg);
    background: color-mix(in srgb, #fff 80%, transparent);
    box-shadow: 0 2px 8px -3px color-mix(in srgb, #000 30%, transparent);
    animation: lg-dice-stamp-slam 0.5s 0.8s cubic-bezier(0.2, 1.6, 0.3, 1) both;
  }
  .lg-dice-stamp-word {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.2em;
  }
  .lg-dice-stamp-dc {
    font-size: 8.5px;
    letter-spacing: 0.06em;
    font-weight: 500;
    margin-top: 2px;
    opacity: 0.85;
  }
  @keyframes lg-dice-stamp-slam {
    0%   { transform: rotate(-20deg) scale(2.2); opacity: 0; }
    60%  { transform: rotate(-8deg) scale(1.08); opacity: 1; }
    100% { transform: rotate(-8deg) scale(1); opacity: 1; }
  }
  .lg-dice-stamp--pass {
    color: #2a6b4d;
    border-color: color-mix(in srgb, #2a6b4d 80%, transparent);
  }
  .lg-dice-stamp--fail {
    color: #b8381f;
    border-color: color-mix(in srgb, #b8381f 80%, transparent);
  }

  /* ── Header (narration only, single line, fixed height) ──── */
  .lg-ritual-head {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 32px;
    text-align: center;
    height: 20px;
  }
  .lg-ritual-name {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 14px;
    letter-spacing: 0.06em;
    color: var(--rink-strong);
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Arg badge — lives on the stage, top-right. Fixed slot, ellipsis overflow.
     Decoupled from header so card outer size never reflows on tool switch. */
  .lg-ritual-arg {
    position: absolute;
    top: 8px;
    right: 8px;
    max-width: 180px;
    font-size: 10.5px;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border: 1px solid var(--rink-faint);
    border-radius: 2px;
    background: color-mix(in srgb, #fff 55%, transparent);
    backdrop-filter: blur(2px);
    color: var(--rink);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    z-index: 1;
    animation: lg-ritual-arg-in 0.35s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  }
  @keyframes lg-ritual-arg-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .lg-ritual-chain {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
    min-height: 18px;
  }
  .lg-seal {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--rink-strong) 40%, transparent);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, #fff 20%, transparent);
    flex-shrink: 0;
  }
  .lg-seal--live {
    background:
      radial-gradient(circle at 50% 60%, #f3b042, var(--rink-accent) 70%);
    border-color: var(--rink-accent);
    animation: lg-seal-flicker 1.1s ease-in-out infinite;
  }
  .lg-seal--done {
    background:
      radial-gradient(circle at 35% 30%, color-mix(in srgb, #fff 60%, transparent), transparent 50%),
      #b8381f;
    border-color: color-mix(in srgb, #b8381f 70%, transparent);
    animation: lg-seal-press 0.45s cubic-bezier(0.2, 1.2, 0.3, 1) both;
  }
  .lg-seal--err {
    background: #2d2015;
    border-color: color-mix(in srgb, #2d2015 70%, transparent);
    opacity: 0.55;
  }
  .lg-seal-more {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 10px;
    color: var(--rink);
    font-style: italic;
    letter-spacing: 0.05em;
  }
  @keyframes lg-seal-flicker {
    0%, 100% { box-shadow: inset 0 0 0 2px color-mix(in srgb, #fff 20%, transparent), 0 0 0 0 color-mix(in srgb, var(--rink-accent) 50%, transparent); }
    50%      { box-shadow: inset 0 0 0 2px color-mix(in srgb, #fff 35%, transparent), 0 0 6px 0 color-mix(in srgb, var(--rink-accent) 60%, transparent); }
  }
  @keyframes lg-seal-press {
    from { transform: scale(0.4); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
  }

  /* Floating dust motes (peace) / embers (combat) */
  .lg-ritual-mote {
    position: absolute;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--rink-accent) 55%, transparent);
    opacity: 0;
    pointer-events: none;
    animation: lg-mote-drift 12s ease-in-out infinite;
  }
  .lg-ritual-mote-1 { left: 12%; bottom: -6px; animation-delay: 0s;   animation-duration: 11s; }
  .lg-ritual-mote-2 { left: 28%; bottom: -6px; animation-delay: 2s;   animation-duration: 13s; }
  .lg-ritual-mote-3 { left: 44%; bottom: -6px; animation-delay: 4s;   animation-duration: 12s; }
  .lg-ritual-mote-4 { left: 60%; bottom: -6px; animation-delay: 6s;   animation-duration: 14s; }
  .lg-ritual-mote-5 { left: 76%; bottom: -6px; animation-delay: 8s;   animation-duration: 11.5s; }
  .lg-ritual-mote-6 { left: 90%; bottom: -6px; animation-delay: 10s;  animation-duration: 13.5s; }
  @keyframes lg-mote-drift {
    0%   { transform: translate(0, 0); opacity: 0; }
    15%  { opacity: 0.7; }
    50%  { transform: translate(-12px, -120px); opacity: 0.5; }
    100% { transform: translate(20px, -220px); opacity: 0; }
  }

  @keyframes lg-ritual-fade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .lg-ritual,
    .lg-ritual *,
    .rs-ripple, .rs-vapor, .rs-line, .rs-grep-hit, .rs-lens,
    .rs-write-line, .rs-quill, .rs-quill-drop, .rs-edit-line, .rs-edit-strike, .rs-edit-new,
    .rs-append-caret, .rs-append-drop, .rs-append-new,
    .lg-customs-paper, .lg-customs-seal, .lg-customs-seal-beam, .lg-customs-seal-ticks,
    .lg-customs-head-text, .lg-customs-meta, .lg-customs-row, .lg-customs-value--bump,
    .lg-customs-stamp, .lg-customs-sig-line::after,
    .rs-compass, .rs-needle,
    .rs-sigil-outer, .rs-sigil-inner, .rs-sigil-star, .rs-sigil-core,
    .rdie-spin, .rdie-text, .lg-seal--live, .lg-ritual-mote,
    .rdc-ring, .lg-dice-total, .lg-dice-stamp, .lg-dice-verdict, .rscene-script {
      animation: none !important;
      transition: none !important;
    }
    .rdie-text { opacity: 1; }
    .rs-line, .rs-write-line, .rs-edit-new, .rs-edit-strike, .rs-append-new,
    .rs-sigil-outer, .rs-sigil-inner {
      stroke-dashoffset: 0;
      opacity: 1;
    }
    .lg-ritual[data-state="settled"] .lg-dice-verdict { opacity: 1; }
  }

  /* ── Combat Mode (어두운 가죽 · 촛불 황금) ──────────────────── */
  .lg-stage[data-mode="combat"] {
    background: #1a110a;
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-header,
  .lg-stage[data-mode="combat"] .lg-header--empty {
    background: color-mix(in srgb, #251810 92%, transparent);
    border-bottom-color: color-mix(in srgb, #d48a1f 24%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-header-title {
    color: #d48a1f;
    text-shadow: 0 1px 0 color-mix(in srgb, #000 60%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-header-stamp,
  .lg-stage[data-mode="combat"] .lg-bearing-label,
  .lg-stage[data-mode="combat"] .lg-bearing-text {
    color: #b8a38a;
  }
  .lg-stage[data-mode="combat"] .lg-vital-track {
    stroke: color-mix(in srgb, #d8c9a8 14%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-effect {
    color: #d48a1f;
    border-color: color-mix(in srgb, #d48a1f 35%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-reel {
    background:
      radial-gradient(ellipse at 50% 0%, color-mix(in srgb, #d48a1f 8%, transparent), transparent 50%),
      #1a110a;
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-narration-text {
    color: #b8a38a;
  }
  .lg-stage[data-mode="combat"] .lg-narration-rule {
    background: color-mix(in srgb, #d8c9a8 18%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-stamp {
    background: color-mix(in srgb, #d48a1f 10%, #2e1c14);
    border-color: color-mix(in srgb, #d48a1f 30%, transparent);
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-stamp-glyph {
    color: #d48a1f;
  }
  .lg-stage[data-mode="combat"] .lg-whisper {
    background: color-mix(in srgb, #d48a1f 6%, #251810);
    color: #d8c9a8;
    border-color: color-mix(in srgb, #d48a1f 18%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-plate-text {
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-name {
    color: #d48a1f;
  }
  .lg-stage[data-mode="combat"] .lg-appendix {
    background: color-mix(in srgb, #251810 90%, transparent);
    border-top-color: color-mix(in srgb, #d48a1f 24%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-appendix-title,
  .lg-stage[data-mode="combat"] .lg-appendix-count {
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-item-name,
  .lg-stage[data-mode="combat"] .lg-quest-name {
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-item-desc,
  .lg-stage[data-mode="combat"] .lg-quest-desc {
    color: #8a7658;
  }
  .lg-stage[data-mode="combat"] .lg-ability {
    background: color-mix(in srgb, #d48a1f 4%, #1a110a);
    border-left-color: color-mix(in srgb, #d48a1f 28%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-ability-ko {
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-ability-mod {
    color: #d48a1f;
  }
  .lg-stage[data-mode="combat"] .lg-ability--strong {
    border-left-color: color-mix(in srgb, #d48a1f 60%, transparent);
    background: color-mix(in srgb, #d48a1f 10%, #1a110a);
  }
  .lg-stage[data-mode="combat"] .lg-ability--strong .lg-ability-mod {
    color: #f3b042;
  }
  .lg-stage[data-mode="combat"] .lg-ability--weak {
    background: transparent;
    border-left-color: color-mix(in srgb, #8a7658 25%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-ability--weak .lg-ability-mod {
    color: #8a7658;
  }
  .lg-stage[data-mode="combat"] .lg-choice {
    background: color-mix(in srgb, #d48a1f 6%, #1a110a);
    border-color: color-mix(in srgb, #d48a1f 32%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-choice-option {
    background: color-mix(in srgb, #d48a1f 4%, #251810);
    border-color: color-mix(in srgb, #d48a1f 24%, transparent);
    color: #d8c9a8;
  }
  .lg-stage[data-mode="combat"] .lg-choice-option:hover {
    background: color-mix(in srgb, #d48a1f 14%, #251810);
    border-color: color-mix(in srgb, #d48a1f 50%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-choice-title,
  .lg-stage[data-mode="combat"] .lg-choice-hint {
    color: #b8a38a;
  }
  .lg-stage[data-mode="combat"] .lg-choice-stat {
    color: #b8a38a;
    border-color: color-mix(in srgb, #d48a1f 24%, transparent);
    background: color-mix(in srgb, #000 30%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-choice-dc {
    color: #d48a1f;
    border-color: color-mix(in srgb, #d48a1f 45%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-ritual {
    --rink: #d8c9a8;
    --rink-strong: #f3b042;
    --rink-soft: color-mix(in srgb, #d48a1f 60%, transparent);
    --rink-faint: color-mix(in srgb, #d48a1f 28%, transparent);
    --rink-bg: #2e1c14;
    --rink-accent: #d48a1f;
    background:
      radial-gradient(ellipse at 100% 0%, color-mix(in srgb, #d48a1f 10%, transparent), transparent 60%),
      color-mix(in srgb, #d48a1f 8%, #251810);
    border-color: color-mix(in srgb, #d48a1f 38%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #d48a1f 14%, transparent),
      0 8px 22px -10px color-mix(in srgb, #000 60%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-ritual-stage {
    background:
      radial-gradient(circle at 50% 0%, color-mix(in srgb, #d48a1f 14%, transparent), transparent 65%),
      color-mix(in srgb, #d48a1f 4%, #1a110a);
    border-color: color-mix(in srgb, #d48a1f 28%, transparent);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, #d48a1f 16%, transparent),
      inset 0 -20px 40px -30px color-mix(in srgb, #d48a1f 40%, transparent);
  }
  .lg-stage[data-mode="combat"] .rs-page {
    fill: color-mix(in srgb, #d48a1f 10%, #2e1c14);
  }
  .lg-stage[data-mode="combat"] .rs-parchment {
    fill: color-mix(in srgb, #d48a1f 6%, #2e1c14);
  }
  .lg-stage[data-mode="combat"] .rdie-face {
    fill: color-mix(in srgb, #d48a1f 12%, #2e1c14);
    filter: drop-shadow(0 0 4px color-mix(in srgb, #d48a1f 30%, transparent));
  }
  .lg-stage[data-mode="combat"] .lg-ritual[data-state="settled"] .rdie-face {
    fill: color-mix(in srgb, #d48a1f 22%, #2e1c14);
  }
  .lg-stage[data-mode="combat"] .rdie-text {
    fill: #f3b042;
  }
  .lg-stage[data-mode="combat"] .rs-pot {
    fill: color-mix(in srgb, #d48a1f 22%, #1a110a);
    stroke: #d48a1f;
  }
  .lg-stage[data-mode="combat"] .lg-dice-stamp {
    background: color-mix(in srgb, #d48a1f 8%, #1a110a);
  }
  .lg-stage[data-mode="combat"] .lg-dice-stamp--pass {
    color: #d48a1f;
    border-color: color-mix(in srgb, #d48a1f 80%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-dice-stamp--fail {
    color: #ff6a4a;
    border-color: color-mix(in srgb, #ff6a4a 70%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-seal--done {
    background:
      radial-gradient(circle at 35% 30%, color-mix(in srgb, #fff 30%, transparent), transparent 50%),
      #d48a1f;
    border-color: color-mix(in srgb, #d48a1f 70%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-seal--err {
    background: #6b1a1a;
  }
  .lg-stage[data-mode="combat"] .lg-ritual-arg {
    color: #d8c9a8;
    background: color-mix(in srgb, #000 30%, transparent);
    border-color: color-mix(in srgb, #d48a1f 28%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-ritual-name {
    color: #d48a1f;
  }
  .lg-stage[data-mode="combat"] .lg-ritual-mote {
    background: color-mix(in srgb, #d48a1f 70%, transparent);
    box-shadow: 0 0 4px color-mix(in srgb, #d48a1f 70%, transparent);
  }

  /* Customs form fallback (creative empty state usually peace; combat fallback only) */
  .lg-stage[data-mode="combat"] .lg-customs {
    --form-ink: #e6cf9b;
    --form-ink-soft: color-mix(in srgb, #e6cf9b 55%, transparent);
    --form-ink-faint: color-mix(in srgb, #e6cf9b 22%, transparent);
    --form-paper: #1a110a;
    --form-paper-edge: color-mix(in srgb, #d48a1f 50%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-customs-paper {
    background:
      repeating-linear-gradient(to bottom, transparent 0, transparent 31px, color-mix(in srgb, #d48a1f 6%, transparent) 31px, color-mix(in srgb, #d48a1f 6%, transparent) 32px),
      linear-gradient(168deg, #2a1c12 0%, #1a110a 100%);
    box-shadow: 0 24px 40px -16px rgba(0,0,0,0.45), 0 1px 0 color-mix(in srgb, #d48a1f 12%, transparent) inset;
  }
</style>`;

// ── Main renderer ────────────────────────────

export function render(ctx: RenderContext): string {
  const nameMap = buildNameMap(ctx);
  const mode = readWorldMode(ctx);
  const status = readStatusYaml(ctx);
  const stats = readStatsYaml(ctx);
  const inventory = readInventoryYaml(ctx);
  const quests = readQuestYaml(ctx);

  const sceneFiles = ctx.files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );

  const allContent = sceneFiles
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

  const pendingCard = renderPendingCard(ctx.state, mode);

  if (sceneFiles.length === 0 || (groups.length === 0 && !status)) {
    return `${STYLES}
      <div class="lg-stage" data-mode="${mode}">
        ${renderLogHeader(status, entryCode)}
        ${renderPersonaBar(persona)}
        <div class="lg-reel">${renderEmpty()}</div>
        ${pendingCard}
      </div>`;
  }

  const beats = renderBeats(groups, ctx, nameMap, fallbackColorMap, persona);
  const appendix = renderAppendix(inventory, quests, stats);
  const personaBar = renderPersonaBar(persona);
  const choicesHtml = renderNextChoices(choices, stats);

  return `${STYLES}
    <div class="lg-stage" data-mode="${mode}">
      ${renderLogHeader(status, entryCode)}
      ${personaBar}
      <div class="lg-body">
        <div class="lg-reel">
          ${beats}
          ${choicesHtml}
          <div data-chat-anchor></div>
        </div>
        ${appendix ? `<aside class="lg-side">${appendix}</aside>` : ""}
      </div>
      ${pendingCard}
    </div>`;
}
