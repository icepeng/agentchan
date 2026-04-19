// ─────────────────────────────────────────────────────────────────────────────
//   rpg-chat renderer  ·  "Vellum Day — Cartographer's Logbook"
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

interface RenderToolCall {
  id: string;
  name: string;
  argsComplete: boolean;
  executionStarted: boolean;
  result?: { isError: boolean };
}

interface RenderStreamView {
  isStreaming: boolean;
  text: string;
  toolCalls: RenderToolCall[];
}

interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  stream: RenderStreamView;
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
        <span class="lg-appendix-title">Pack Manifest</span>
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
        <span class="lg-appendix-title">Standing Charts</span>
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
        <span class="lg-appendix-title">Ability Scores</span>
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

// ── Pending Card (스트리밍 중 시각 피드백) ──────────────
//
// ctx.stream.isStreaming 이 true 일 때만 노출. 스트리밍 텍스트와 진행 중 도구 호출의
// 라벨을 보여준다. id 고정 → Idiomorph가 부드럽게 morph.

function pendingToolLabel(name: string): string {
  const map: Record<string, string> = {
    read: "고서를 펼친다",
    grep: "단서를 더듬는다",
    write: "기록을 남긴다",
    edit: "기록을 손본다",
    script: "주사위를 굴린다",
    activate_skill: "비법서를 펼친다",
    tree: "지도를 살핀다",
  };
  return map[name] ?? "비의를 엮는다";
}

function renderPendingCard(
  stream: RenderStreamView,
  mode: "peace" | "combat",
): string {
  const inFlight = stream.toolCalls.find((tc) => !tc.result);
  const latest = inFlight ?? stream.toolCalls[stream.toolCalls.length - 1];
  const label =
    mode === "combat" ? "촛불 아래 손이 움직인다" : "잉크가 마르는 중";
  const raw = stream.text || "";
  const clipped = raw.length > 160 ? raw.slice(0, 160) + "\u2026" : raw;
  const toolLabel = latest ? pendingToolLabel(latest.name) : "";
  const hidden = stream.isStreaming ? "" : ' hidden aria-hidden="true"';

  return `
    <aside id="lg-pending" class="lg-pending" data-mode="${mode}"${hidden}>
      <div class="lg-pending-head">
        <span class="lg-pending-glyph" aria-hidden="true"></span>
        <span class="lg-pending-label">${escapeText(label)}</span>
        ${toolLabel ? `<span class="lg-pending-tool">${escapeText(toolLabel)}</span>` : ""}
      </div>
      ${clipped ? `<p class="lg-pending-preview">${escapeText(clipped)}</p>` : ""}
    </aside>`;
}

// ── Empty state: Character Builder ─────────────────────────────
//
// 첫 세션 부트스트랩. 스탯 스테퍼(총합 6, 각 -1~+5) + 이름 입력 + 확인 버튼으로
// `/init` 슬래시 메시지를 조합해 send한다. 확인 버튼은 capture-phase 리스너에서
// DOM 상태를 읽어 data-text 를 채운 뒤 bubbling의 RenderedView 핸들러가 기존
// data-action="send" 파이프라인으로 전송하도록 한다. 총합 ≠ 6 또는 이름 공백이면
// stopImmediatePropagation 으로 전송을 막는다.

const BUILDER_TOTAL = 6;
const BUILDER_MIN = -1;
const BUILDER_MAX = 5;

function renderBuilderStepper(key: StatKey): string {
  return `
    <div class="lg-builder-row">
      <span class="lg-builder-label">
        <span class="lg-builder-long">${escapeText(key)}</span>
      </span>
      <div class="lg-builder-stepper" data-stat="${key}">
        <button type="button" class="lg-builder-step" data-inc="-1" aria-label="${escapeHtml(key)} 감소">&#x2212;</button>
        <span class="lg-builder-value" data-stat-value="${key}" data-value="0">0</span>
        <button type="button" class="lg-builder-step" data-inc="1" aria-label="${escapeHtml(key)} 증가">&#x002B;</button>
      </div>
    </div>`;
}

function renderEmpty(): string {
  const rows = STAT_KEYS.map(renderBuilderStepper).join("");

  return `
    <div class="lg-empty">
      <svg class="lg-lighthouse" viewBox="0 0 40 80" aria-hidden="true">
        <path d="M14 72 L26 72 L24 30 L16 30 Z" fill="none" stroke="currentColor" stroke-width="0.8" />
        <rect x="13" y="22" width="14" height="8" fill="none" stroke="currentColor" stroke-width="0.8" />
        <path d="M17 22 L20 12 L23 22 Z" fill="none" stroke="currentColor" stroke-width="0.8" />
        <circle cx="20" cy="26" r="2.5" class="lg-lighthouse-beam" />
        <line x1="6" y1="72" x2="34" y2="72" stroke="currentColor" stroke-width="0.5" opacity="0.4" />
      </svg>
      <div class="lg-empty-rule"></div>
      <h2 class="lg-empty-title">Character Ledger</h2>
      <p class="lg-empty-sub">모험가 시트를 채워주세요. 총합 ${BUILDER_TOTAL}점을 ${BUILDER_MAX}과 ${BUILDER_MIN} 사이에서 나눕니다.</p>
      <div class="lg-empty-rule"></div>
      <form class="lg-builder" data-builder="1" onsubmit="return false">
        <div class="lg-builder-stats">${rows}</div>
        <div class="lg-builder-total" data-builder-total>
          <span class="lg-builder-total-label">Total</span>
          <span class="lg-builder-total-value" data-total-value>0</span>
          <span class="lg-builder-total-target">/ ${BUILDER_TOTAL}</span>
        </div>
        <label class="lg-builder-name">
          <span class="lg-builder-name-label">이름</span>
          <input type="text" data-builder-name maxlength="20" placeholder="예: 시아" autocomplete="off" spellcheck="false" />
        </label>
        <p class="lg-builder-error" data-builder-error hidden></p>
        <button type="button" class="lg-builder-submit" data-builder-submit data-action="send" data-text="" disabled>
          <span class="lg-builder-submit-glyph" aria-hidden="true">&#x2756;</span>
          <span>이 인물로 시작</span>
        </button>
      </form>
    </div>
    <script>
    (function () {
      var root = document.currentScript && document.currentScript.previousElementSibling;
      // currentScript는 <div class="lg-empty">의 형제가 아닐 수 있으므로 가장 가까운 폼으로 fallback
      var form = (root && root.querySelector) ? root.querySelector('.lg-builder') : null;
      if (!form) form = document.querySelector('.lg-builder[data-builder="1"]');
      if (!form || form.dataset.bound === '1') return;
      form.dataset.bound = '1';

      var MIN = ${BUILDER_MIN};
      var MAX = ${BUILDER_MAX};
      var TARGET = ${BUILDER_TOTAL};
      var KEYS = ${JSON.stringify(STAT_KEYS)};

      var nameInput = form.querySelector('[data-builder-name]');
      var totalEl = form.querySelector('[data-total-value]');
      var totalBox = form.querySelector('[data-builder-total]');
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
          var stepper = form.querySelector('.lg-builder-stepper[data-stat="' + k + '"]');
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

      form.querySelectorAll('[data-inc]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var stepper = btn.closest('.lg-builder-stepper');
          if (!stepper) return;
          var key = stepper.dataset.stat;
          var valueEl = stepper.querySelector('[data-stat-value="' + key + '"]');
          if (!valueEl) return;
          var cur = parseInt(valueEl.dataset.value, 10) || 0;
          var delta = parseInt(btn.dataset.inc, 10) || 0;
          var next = cur + delta;
          if (next < MIN || next > MAX) return;
          if (delta > 0) {
            var total = sum(readStats());
            if (total >= TARGET) return;
          }
          valueEl.dataset.value = String(next);
          valueEl.textContent = next > 0 ? ('+' + next) : String(next);
          refresh();
        });
      });

      if (nameInput) {
        nameInput.addEventListener('input', refresh);
        nameInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            if (!submit.disabled) submit.click();
          }
        });
      }

      // capture-phase: bubbling에서 RenderedView가 data-text를 읽기 전에 세팅 or 차단
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
  }
  @container (min-width: 1080px) {
    .lg-body {
      grid-template-columns: minmax(0, 1fr) minmax(0, 760px) minmax(0, 1fr);
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
      padding: 28px 24px 32px 24px;
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

  /* ── Empty state: Uncharted Shores ────────────────────────────── */
  .lg-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 64px 24px 48px;
    min-height: 480px;
    text-align: center;
  }
  .lg-lighthouse {
    width: 44px;
    height: 88px;
    color: var(--color-fg-3);
    margin-bottom: 4px;
  }
  .lg-lighthouse-beam {
    fill: ${ILLUMINATED_COPPER};
    animation: lg-beam 2.6s ease-in-out infinite;
    transform-origin: 20px 26px;
    filter: drop-shadow(0 0 6px ${ILLUMINATED_COPPER});
  }
  @keyframes lg-beam {
    0%, 100% { opacity: 0.35; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.25); }
  }
  .lg-empty-rule {
    width: 68px;
    height: 1px;
    background: color-mix(in srgb, var(--color-edge) 22%, transparent);
  }
  .lg-empty-title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: var(--color-fg);
  }
  .lg-empty-sub {
    margin: 0;
    max-width: 360px;
    font-family: var(--font-family-body);
    font-size: 13px;
    font-style: italic;
    line-height: 1.75;
    color: var(--color-fg-3);
  }
  /* ── Character Builder ─────────────────────────────────────── */
  .lg-builder {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 440px;
    margin-top: 8px;
  }
  .lg-builder-stats {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lg-builder-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--color-edge) 18%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 3%, transparent);
  }
  .lg-builder-label {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    color: var(--color-fg);
  }
  .lg-builder-long {
    font-family: var(--font-family-body);
    font-size: 13px;
    color: var(--color-fg);
    letter-spacing: 0.04em;
  }
  .lg-builder-stepper {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .lg-builder-step {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 30%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 4%, transparent);
    color: var(--color-fg);
    font-family: var(--font-family-mono);
    font-size: 14px;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
  }
  .lg-builder-step:hover:not(:disabled) {
    border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 65%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 12%, transparent);
  }
  .lg-builder-step:disabled {
    opacity: 0.28;
    cursor: not-allowed;
  }
  .lg-builder-value {
    min-width: 32px;
    text-align: center;
    font-family: var(--font-family-mono);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-fg);
  }
  .lg-builder-total {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px dashed color-mix(in srgb, var(--color-edge) 22%, transparent);
    border-bottom: 1px dashed color-mix(in srgb, var(--color-edge) 22%, transparent);
    font-family: var(--font-family-mono);
  }
  .lg-builder-total-label {
    font-size: 10px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-fg-4);
  }
  .lg-builder-total-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-fg-3);
    transition: color 0.25s ease;
  }
  .lg-builder-total[data-state="ok"] .lg-builder-total-value {
    color: ${ILLUMINATED_COPPER};
  }
  .lg-builder-total[data-state="over"] .lg-builder-total-value {
    color: #c85a3a;
  }
  .lg-builder-total-target {
    font-size: 13px;
    color: var(--color-fg-4);
  }
  .lg-builder-name {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lg-builder-name-label {
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-fg-4);
  }
  .lg-builder-name input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--color-edge) 22%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 3%, transparent);
    color: var(--color-fg);
    font-family: var(--font-family-body);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .lg-builder-name input:focus {
    border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 60%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 6%, transparent);
  }
  .lg-builder-error {
    margin: 0;
    font-family: var(--font-family-body);
    font-size: 12px;
    color: #c85a3a;
    text-align: center;
  }
  .lg-builder-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 18px;
    margin-top: 4px;
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 45%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 10%, transparent);
    color: var(--color-fg);
    font-family: var(--font-family-body);
    font-size: 13.5px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.25s ease, background 0.25s ease, opacity 0.25s ease;
  }
  .lg-builder-submit:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 70%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 18%, transparent);
  }
  .lg-builder-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .lg-builder-submit-glyph {
    color: ${ILLUMINATED_COPPER};
    font-size: 11px;
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

  /* ── Pending Card (스트리밍 중 시각 피드백) ────────────────── */
  .lg-pending {
    position: sticky;
    bottom: 12px;
    margin: 12px 16px 0;
    padding: 10px 14px;
    background: color-mix(in srgb, #b36b2a 4%, var(--color-elevated, #fff8e4));
    border: 1px solid color-mix(in srgb, #b36b2a 24%, transparent);
    border-radius: 3px;
    box-shadow: 0 6px 16px -8px color-mix(in srgb, #3d2a15 30%, transparent);
    z-index: 5;
    animation: lg-pending-fade 0.4s ease-out;
  }
  .lg-pending[hidden] { display: none; }
  .lg-pending-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .lg-pending-glyph {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #b36b2a;
    flex-shrink: 0;
    align-self: center;
    animation: lg-pending-breathe 1.6s ease-in-out infinite;
  }
  .lg-pending-label {
    font-family: var(--font-display, "Syne", "Lexend", system-ui, sans-serif);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-fg-2, #5a4530);
  }
  .lg-pending-tool {
    font-size: 11px;
    color: var(--color-fg-3, #8a6e4d);
    font-style: italic;
  }
  .lg-pending-preview {
    margin: 6px 0 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--color-fg-3, #8a6e4d);
    font-style: italic;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  @keyframes lg-pending-fade {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes lg-pending-breathe {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50%      { opacity: 1;   transform: scale(1.2); }
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
  .lg-stage[data-mode="combat"] .lg-pending {
    background: color-mix(in srgb, #d48a1f 8%, #251810);
    border-color: color-mix(in srgb, #d48a1f 35%, transparent);
    box-shadow: 0 6px 18px -8px color-mix(in srgb, #d48a1f 35%, transparent);
  }
  .lg-stage[data-mode="combat"] .lg-pending-glyph {
    background: #d48a1f;
  }
  .lg-stage[data-mode="combat"] .lg-pending-label {
    color: #d48a1f;
  }
  .lg-stage[data-mode="combat"] .lg-pending-tool,
  .lg-stage[data-mode="combat"] .lg-pending-preview {
    color: #b8a38a;
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

  const pendingCard = renderPendingCard(ctx.stream, mode);

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
