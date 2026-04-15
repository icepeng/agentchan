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
//
//   파싱 계층은 기존 마커 규격과 묶여 있어 보존한다. 시각 언어만 교체.
//   Idiomorph가 DOM을 morph하므로 beat마다 index 기반 stable id를 부여하여
//   재렌더 간 CSS 애니메이션이 끊기지 않게 한다.
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

type ProjectFile = TextFile | BinaryFile;

interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
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

// ── Theme: Vellum Day — 크림 양피지 · 세피아 잉크 · 풍화 청동 · 채식 구리 ──
//
// sentinel과 동일한 override 패턴이지만 scheme이 light.
// prefersScheme: "light" → Settings 이동 시 사용자의 원래 테마로 자동 복귀.
// void는 페이지 외곽(조금 더 짙은 종이), surface는 로그북 본문의 가장 밝은 면.

export const theme: RendererTheme = {
  base: {
    void: "#e8dcc0",     // 낡은 양피지 가장자리 (body bg)
    base: "#eee3c8",     // 페이지 외곽
    surface: "#f6ecd2",  // 로그북 본문
    elevated: "#fff8e4", // 폴라로이드·스탬프 캐리어
    accent: "#3d7a6d",   // verdigris — 풍화된 청동, anima·신뢰·성공
    fg: "#2d2015",       // 진한 세피아 잉크
    fg2: "#5a4530",      // 중간 잉크
    fg3: "#8a6e4d",      // 흐린 펜
    edge: "#3d2a15",     // 잉크 hairline 기준색
  },
  prefersScheme: "light",
};

// ── Palette (renderer internal) ──────────────
//
// ILLUMINATED_COPPER · VERDIGRIS · VERMILION — 중세 채식 필사본(illuminated
// manuscript)의 세 가지 안료에서 차용한 이름. 야간 팔레트(lantern / moonwash /
// blood)와 의도적으로 다른 용어로 잡아 sentinel과의 정체성 혼동을 방지한다.

const ILLUMINATED_COPPER = "#b36b2a"; // 경고·vigor mid·브랜딩 글리프
const VERDIGRIS = "#3d7a6d";          // anima·신뢰·성공·컴퍼스 rose
const VERMILION = "#a83225";          // danger·HP low·상태이상 스탬프

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
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function resolveImageUrl(ctx: RenderContext, dir: string, imageKey: string): string {
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

function resolveAvatar(line: ChatLine, nameMap: Map<string, NameMapEntry>): ChatLine {
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
  hp?: { current: number; max: number };
  mp?: { current: number; max: number };
  emotion?: string;
  location?: string;
  effects?: string;
}

interface InventoryItem {
  type: "+" | "-" | "=";
  name: string;
  description?: string;
}

interface QuestEntry {
  type: "~" | "+" | "\u2713";
  name: string;
  description?: string;
}

// ── RPG Parsing (기존 로직 보존) ────────────

function parseStatusBlock(content: string): RpgStatus | null {
  const blocks = [...content.matchAll(/\[STATUS\]\n([\s\S]*?)\n?\[\/STATUS\]/g)];
  if (blocks.length === 0) return null;
  const lastBlock = blocks[blocks.length - 1][1];

  const status: RpgStatus = {};
  for (const line of lastBlock.split("\n")) {
    const match = line.match(/^(\S+):\s*(.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    switch (key) {
      case "HP": {
        const m = value.match(/(\d+)\/(\d+)/);
        if (m) status.hp = { current: parseInt(m[1]), max: parseInt(m[2]) };
        break;
      }
      case "MP": {
        const m = value.match(/(\d+)\/(\d+)/);
        if (m) status.mp = { current: parseInt(m[1]), max: parseInt(m[2]) };
        break;
      }
      case "감정":
        status.emotion = value.trim();
        break;
      case "위치":
        status.location = value.trim();
        break;
      case "상태":
        status.effects = value.trim();
        break;
    }
  }
  return status;
}

function parseInventoryBlock(content: string): InventoryItem[] {
  const blocks = [...content.matchAll(/\[INVENTORY\]\n([\s\S]*?)\n?\[\/INVENTORY\]/g)];
  if (blocks.length === 0) return [];
  const lastBlock = blocks[blocks.length - 1][1];

  const items: InventoryItem[] = [];
  for (const line of lastBlock.split("\n")) {
    const match = line.match(/^([+\-=])\s+(.+?)(?:\s+\u2014\s+(.+))?$/);
    if (!match) continue;
    items.push({
      type: match[1] as "+" | "-" | "=",
      name: match[2].trim(),
      description: match[3]?.trim(),
    });
  }
  return items;
}

function parseQuestBlock(content: string): QuestEntry[] {
  const blocks = [...content.matchAll(/\[QUEST\]\n([\s\S]*?)\n?\[\/QUEST\]/g)];
  if (blocks.length === 0) return [];
  const lastBlock = blocks[blocks.length - 1][1];

  const quests: QuestEntry[] = [];
  for (const line of lastBlock.split("\n")) {
    const match = line.match(/^([~+\u2713])\s+(.+?)(?:\s+\u2014\s+(.+))?$/);
    if (!match) continue;
    quests.push({
      type: match[1] as "~" | "+" | "\u2713",
      name: match[2].trim(),
      description: match[3]?.trim(),
    });
  }
  return quests;
}

function stripRpgBlocks(content: string): string {
  return content
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
        (prev.characterName === line.characterName && prev.imageKey === line.imageKey))
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
  const initial = displayName.charAt(0).toUpperCase();

  const resolvedDir = charDir ?? entry?.dir;
  if (resolvedDir && imageKey) {
    const src = resolveImageUrl(ctx, resolvedDir, imageKey);
    const portraitHtml = `
      <div class="lg-portrait">
        <div class="lg-portrait-halo"></div>
        <img class="lg-portrait-img" src="${escapeHtml(src)}" alt="${escapeHtml(displayName)}" onerror="this.parentElement.dataset.fallback='1'" />
        <div class="lg-portrait-fallback" aria-hidden="true">${escapeText(initial)}</div>
      </div>`;
    return { color, portraitHtml };
  }

  return {
    color,
    portraitHtml: `<div class="lg-portrait" data-fallback="1">
        <div class="lg-portrait-halo"></div>
        <div class="lg-portrait-fallback" aria-hidden="true">${escapeText(initial)}</div>
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
  const info = resolveCharacterInfo(dir, imageKey, displayName, ctx, nameMap, isolatedColorMap);
  const color = fm.color ? String(fm.color) : info.color;

  return { displayName, color, portraitHtml: info.portraitHtml };
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
    status.effects && status.effects !== "없음"
      ? `<span class="lg-effect">${escapeText(status.effects)}</span>`
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
  const activeCount = items.filter((i) => i.type !== "-").length;
  const rows = items
    .map((item) => {
      const cls =
        item.type === "+"
          ? "lg-item lg-item--acquired"
          : item.type === "-"
            ? "lg-item lg-item--expended"
            : "lg-item lg-item--kept";
      const glyph =
        item.type === "+"
          ? `<span class="lg-item-glyph" style="color:${VERDIGRIS}">&#x2295;</span>`
          : item.type === "-"
            ? `<span class="lg-item-glyph" style="color:${VERMILION}">&#x2296;</span>`
            : '<span class="lg-item-glyph">&middot;</span>';
      const note =
        item.type === "+"
          ? '<span class="lg-item-flag">acquired</span>'
          : item.type === "-"
            ? '<span class="lg-item-flag lg-item-flag--spent">expended</span>'
            : "";
      const desc = item.description
        ? ` <span class="lg-item-desc">— ${escapeText(item.description)}</span>`
        : "";
      return `<li class="${cls}">${glyph}<span class="lg-item-name">${escapeText(item.name)}</span>${desc}${note}</li>`;
    })
    .join("");

  return `
    <details class="lg-appendix-section">
      <summary class="lg-appendix-head">
        <span class="lg-appendix-title">Pack Manifest</span>
        <span class="lg-appendix-count">${activeCount.toString().padStart(2, "0")}</span>
        <span class="lg-appendix-chevron" aria-hidden="true"></span>
      </summary>
      <ul class="lg-item-list">${rows}</ul>
    </details>`;
}

function renderStandingCharts(quests: QuestEntry[]): string {
  if (quests.length === 0) return "";
  const openCount = quests.filter((q) => q.type !== "\u2713").length;
  const rows = quests
    .map((q) => {
      const cls =
        q.type === "~"
          ? "lg-quest lg-quest--pursuing"
          : q.type === "+"
            ? "lg-quest lg-quest--sighted"
            : "lg-quest lg-quest--closed";
      const glyph =
        q.type === "~"
          ? `<span class="lg-quest-glyph" style="color:${ILLUMINATED_COPPER}">&#x223D;</span>`
          : q.type === "+"
            ? `<span class="lg-quest-glyph" style="color:${VERDIGRIS}">&#x2726;</span>`
            : '<span class="lg-quest-glyph">&#x203B;</span>';
      const flag =
        q.type === "~"
          ? '<span class="lg-quest-flag">in pursuit</span>'
          : q.type === "+"
            ? '<span class="lg-quest-flag lg-quest-flag--new">new sighting</span>'
            : '<span class="lg-quest-flag lg-quest-flag--closed">closed</span>';
      const desc = q.description
        ? ` <span class="lg-quest-desc">— ${escapeText(q.description)}</span>`
        : "";
      return `<li class="${cls}">${glyph}<span class="lg-quest-name">${escapeText(q.name)}</span>${desc}${flag}</li>`;
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

function renderAppendix(items: InventoryItem[], quests: QuestEntry[]): string {
  const manifest = renderPackManifest(items);
  const charts = renderStandingCharts(quests);
  if (!manifest && !charts) return "";
  return `
    <footer class="lg-appendix">
      ${manifest}
      ${charts}
    </footer>`;
}

// ── Empty state ─────────────────────────────

// README의 "시작하는 한 줄" 세 개 — empty state의 잉크 칩에 그대로 노출
const OPENING_SEEDS: string[] = [
  "초보 모험가 1레벨. 마을 광장에서 시작.",
  "장비 없이 해적선 갑판에서 깨어나는 장면. HP 60/100으로 시작.",
  "엘라라가 퀘스트를 주는 주점에서 시작",
];

function renderEmpty(): string {
  const chips = OPENING_SEEDS.map(
    (seed) => `
      <button type="button" class="lg-seed" data-action="fill" data-text="${escapeHtml(seed)}">
        <span class="lg-seed-glyph" aria-hidden="true">&#x2605;</span>
        <span class="lg-seed-text">${escapeText(seed)}</span>
      </button>`,
  ).join("");

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
      <h2 class="lg-empty-title">Uncharted Shores</h2>
      <p class="lg-empty-sub">첫 로그 엔트리가 기록되면 이 해안이 드러납니다.</p>
      <div class="lg-empty-rule"></div>
      <div class="lg-seed-label">try an opening</div>
      <div class="lg-seeds">${chips}</div>
    </div>`;
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
          return renderSystem(g.lines[0], id);
      }
    })
    .join("\n");
}

// ── Styles ───────────────────────────────────

const STYLES = `<style>
  /* ── Root: Logbook stage ─────────────────────────────────────── */
  .lg-stage {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    font-family: var(--font-family-body);
    color: var(--color-fg);
  }
  .lg-reel {
    flex: 1;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 28px 28px 32px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 28px;
    box-sizing: border-box;
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
    position: sticky;
    bottom: 0;
    z-index: 4;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: color-mix(in srgb, var(--color-edge) 10%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--color-edge) 12%, transparent);
  }
  .lg-appendix-section {
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
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
    grid-template-columns: 16px auto 1fr auto;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--color-fg);
  }
  .lg-item-glyph, .lg-quest-glyph {
    font-family: var(--font-family-mono);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: var(--color-fg-3);
  }
  .lg-item-name, .lg-quest-name {
    font-weight: 500;
  }
  .lg-item-desc, .lg-quest-desc {
    color: var(--color-fg-3);
    font-size: 12px;
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
  .lg-seed-label {
    font-family: var(--font-family-mono);
    font-size: 9.5px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-fg-4);
    margin-top: 12px;
  }
  .lg-seeds {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
    width: 100%;
    max-width: 440px;
  }
  .lg-seed {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border: 1px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 28%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 4%, transparent);
    color: var(--color-fg);
    font-family: var(--font-family-body);
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.25s ease, background 0.25s ease;
  }
  .lg-seed:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, ${ILLUMINATED_COPPER} 60%, transparent);
    background: color-mix(in srgb, ${ILLUMINATED_COPPER} 10%, transparent);
  }
  .lg-seed:focus-visible {
    outline: 2px solid color-mix(in srgb, ${ILLUMINATED_COPPER} 60%, transparent);
    outline-offset: 2px;
  }
  .lg-seed-glyph {
    color: ${ILLUMINATED_COPPER};
    font-size: 12px;
    flex-shrink: 0;
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
    .lg-appendix { grid-template-columns: 1fr; }
  }
</style>`;

// ── Main renderer ────────────────────────────

export function render(ctx: RenderContext): string {
  const nameMap = buildNameMap(ctx);

  const sceneFiles = ctx.files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );

  if (sceneFiles.length === 0) {
    return `${STYLES}
      <div class="lg-stage">
        ${renderLogHeader(null, stampCode("empty"))}
        <div class="lg-reel">${renderEmpty()}</div>
      </div>`;
  }

  const allContent = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const status = parseStatusBlock(allContent);
  const inventory = parseInventoryBlock(allContent);
  const quests = parseQuestBlock(allContent);
  const entryCode = stampCode(allContent);

  const chatContent = stripRpgBlocks(allContent);

  const fallbackColorMap = new Map<string, string>();
  const persona = resolvePersona(ctx, nameMap);

  const parsed = chatContent
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0 && !status) {
    return `${STYLES}
      <div class="lg-stage">
        ${renderLogHeader(null, entryCode)}
        <div class="lg-reel">${renderEmpty()}</div>
      </div>`;
  }

  const beats = renderBeats(groups, ctx, nameMap, fallbackColorMap, persona);
  const appendix = renderAppendix(inventory, quests);

  return `${STYLES}
    <div class="lg-stage">
      ${renderLogHeader(status, entryCode)}
      <div class="lg-reel">
        ${beats}
        <div data-chat-anchor></div>
      </div>
      ${appendix}
    </div>`;
}
