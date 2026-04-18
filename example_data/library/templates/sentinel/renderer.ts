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

interface RenderToolCallView {
  id: string;
  name: string;
  status: "streaming" | "executing" | "done";
}

interface RenderStreamView {
  isStreaming: boolean;
  text: string;
  toolCalls: ReadonlyArray<RenderToolCallView>;
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

// ── Character meta (hardcoded for this template) ────────
//
// 경계 ↔ 신뢰 단일 축을 세 NPC가 공유한다.
// 값이 낮을수록 경계(−5), 높을수록 신뢰(+5). 모든 캐릭터 동일 방향.

interface CharacterMeta {
  name: string;
  color: string;
  sigil: string; // case-file role, mono tag
  rolePhrase: string; // one-line profile
  quirk: string; // signature physical detail for hover
}

const CHARACTER_META: Record<string, CharacterMeta> = {
  iseo: {
    name: "이서",
    color: "#7eb3cc",
    sigil: "ANALYST · S-01",
    rolePhrase: "27 · 석사 2년차 · 포렌식 컨설턴트",
    quirk: "안경 렌즈에 항상 화면이 반사된다",
  },
  hangyeol: {
    name: "한결",
    color: "#c87766",
    sigil: "CHAIR · S-02",
    rolePhrase: "22 · 3학년 · 동아리 회장",
    quirk: "팔짱을 끼거나 책상을 친다",
  },
  minji: {
    name: "민지",
    color: "#a3b585",
    sigil: "ARCHIVIST · S-03",
    rolePhrase: "21 · 2학년 · 기록·중재",
    quirk: "메모장에 항상 뭔가를 적는다",
  },
};

const CHARACTER_ORDER = ["iseo", "hangyeol", "minji"];

// 통일된 단일 축: 경계 ↔ 신뢰 (모든 NPC 공유)
const METRIC_LABEL = "경계↔신뢰";
const METRIC_POLES: [string, string] = ["경계", "신뢰"]; // [−5, +5]
const METRIC_DESCRIPTIONS: [string, string, string] = [
  "GUARDED — 적극적 경계",
  "NEUTRAL — 피상적 협력",
  "TRUSTED — 깊은 신뢰",
]; // [−5, 0, +5]

// ── Renderer-owned theme ─────────────────────
// 렌더러가 STYLES 안에서 이미 선언한 --ms-* 팔레트를 앱 전역 --color-* 토큰으로 전파한다.
// 값을 새로 결정하지 않고, 각 --ms-* 역할을 가장 가까운 --color-* 슬롯에 매핑.
// prefersScheme: "dark"로 프로젝트 페이지에서만 다크 강제 (Settings 이동 시 자동 복귀).
export function theme(_ctx: RenderContext): RendererTheme {
  return {
    base: {
      void: "#0a0e14", // = --ms-bg
      base: "#0e1319", // = --ms-panel
      surface: "#141b25", // = --ms-panel-raised
      elevated: "#18202c", // = --ms-panel-hover
      accent: "#d4a574", // = --ms-warm (경계/주의 포인트)
      fg: "#e6e2d7", // = --ms-ink
      fg2: "#a6a198", // = --ms-ink-2
      fg3: "#6f6d67", // = --ms-ink-3
      edge: "#c8d2e6", // --ms-edge-strong의 base 색 (alpha 제거)
    },
    prefersScheme: "dark",
  };
}

// ── Palette ──────────────────────────────────

const CHARACTER_COLORS = [
  "#7eb3cc",
  "#d4a574",
  "#a78bfa",
  "#f472b6",
  "#a3b585",
  "#fb923c",
  "#38bdf8",
  "#c87766",
];

// ── Helpers ──────────────────────────────────

function escapeHtml(text: string): string {
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

function clampStat(n: number): number {
  return Math.max(-5, Math.min(5, n));
}

function pad4(n: number): string {
  return n.toString().padStart(4, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// 경계↔신뢰 값을 내러티브 상태로 매핑.
// 모든 캐릭터 동일 방향(+5 = 신뢰 = cool, −5 = 경계 = warm/danger).
function statusTier(value: number): {
  tier: "positive" | "aligned" | "neutral" | "strained" | "critical";
  tone: "cool" | "warm" | "neutral" | "danger";
} {
  if (value >= 3) return { tier: "positive", tone: "cool" };
  if (value >= 1) return { tier: "aligned", tone: "cool" };
  if (value === 0) return { tier: "neutral", tone: "neutral" };
  if (value >= -2) return { tier: "strained", tone: "warm" };
  return { tier: "critical", tone: "danger" };
}

// METRIC_DESCRIPTIONS에서 대문자 단어만 뽑아 상태 라벨로.
function statusWord(value: number): string {
  const descIdx = value === 0 ? 1 : value > 0 ? 2 : 0;
  const desc = METRIC_DESCRIPTIONS[descIdx];
  const m = desc.match(/^([A-Z][A-Z\s]+?)(?:\s+—|\s+-|$)/);
  return m ? m[1].trim() : desc;
}

// ── Chat Types ──────────────────────────────

interface ChatLine {
  type: "user" | "character" | "narration" | "divider" | "stat-change" | "image";
  characterName?: string;
  charDir?: string;
  imageKey?: string;
  text: string;
}

interface ChatGroup {
  type: "user" | "character" | "narration" | "divider" | "stat-change" | "image";
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

interface EvidenceCounter {
  n: number;
}

function renderEvidenceFigure(
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  evidence: EvidenceCounter,
  slug: string,
  key: string,
): string {
  const entry = nameMap.get(slug);
  const dir = entry?.dir ?? slug;
  const url = resolveImageUrl(ctx, dir, key);
  evidence.n += 1;
  const evNum = pad3(evidence.n);
  const hh = pad2(22 + Math.floor((evidence.n - 1) / 6));
  const mm = pad2((evidence.n * 7) % 60);
  const ss = pad2((evidence.n * 23) % 60);
  const charName = entry ? (CHARACTER_META[slug]?.name ?? slug) : slug;
  const emotion = key.replace(/^assets\//, "").replace(/\.[a-z]+$/i, "");
  const captionEmotion = escapeHtml(emotion.toUpperCase());
  return `
      <figure class="ms-evidence" data-ev="${evNum}">
        <div class="ms-evidence-chrome">
          <span class="ms-evidence-corner tl"></span>
          <span class="ms-evidence-corner tr"></span>
          <span class="ms-evidence-corner bl"></span>
          <span class="ms-evidence-corner br"></span>
          <div class="ms-evidence-monitor">
            <img class="ms-evidence-img" src="${url}" alt="${captionEmotion}" onerror="this.closest('.ms-evidence').style.display='none'" />
            <span class="ms-evidence-scan"></span>
            <span class="ms-evidence-rec"><span class="ms-rec-dot"></span>REC · ${hh}:${mm}:${ss}</span>
            <span class="ms-evidence-id">EV-${evNum}</span>
          </div>
        </div>
        <figcaption class="ms-evidence-caption">
          <span class="ms-evidence-label">EVIDENCE · ${captionEmotion}</span>
          <span class="ms-evidence-subject">${escapeHtml(charName)}</span>
        </figcaption>
      </figure>`;
}

function formatInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/"(.+?)"/g, "\u201c$1\u201d")
    .replace(/\*(.+?)\*/g, '<em class="ms-stage">$1</em>');
}

// ── Stat parsing from files/stats.md ─────────

interface Stats {
  iseo: number;
  hangyeol: number;
  minji: number;
}

function parseStats(ctx: RenderContext): Stats {
  const statsFile = ctx.files.find(
    (f): f is TextFile => f.type === "text" && f.path === "stats.md",
  );
  const fm = statsFile?.frontmatter ?? {};
  const read = (k: string): number => {
    const v = fm[k];
    if (typeof v === "number") return clampStat(v);
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : clampStat(n);
    }
    return 0;
  };
  return {
    iseo: read("iseo"),
    hangyeol: read("hangyeol"),
    minji: read("minji"),
  };
}

// ── Chat Line Parsing ───────────────────────

const STANDALONE_IMAGE = /^\[([a-z0-9][a-z0-9-]*):(assets\/[^\]]+)\]$/;
const STAT_CHANGE_LINE = /^\*\s*\u2192\s+(.+?)\s*\*$/; // *→ ... *

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };

  // *→ stat change marker*
  const statMatch = trimmed.match(STAT_CHANGE_LINE);
  if (statMatch) return { type: "stat-change", text: statMatch[1] };

  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };

  // Emotion illustration — standalone line only.
  const imgMatch = trimmed.match(STANDALONE_IMAGE);
  if (imgMatch)
    return { type: "image", charDir: imgMatch[1], imageKey: imgMatch[2], text: "" };

  const charMatch = trimmed.match(/^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/);
  if (charMatch)
    return {
      type: "character",
      characterName: charMatch[1],
      text: charMatch[2],
    };

  const charFallback = trimmed.match(/^([^\s:*][^:]{0,40}):\s*(["*\u201c].*)$/);
  if (charFallback)
    return {
      type: "character",
      characterName: charFallback[1],
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
    if (line.type === "stat-change") {
      groups.push({ type: "stat-change", lines: [line.text] });
      continue;
    }
    if (line.type === "image") {
      groups.push({
        type: "image",
        charDir: line.charDir,
        imageKey: line.imageKey,
        lines: [],
      });
      continue;
    }
    if (
      prev &&
      prev.type === line.type &&
      (line.type !== "character" ||
        prev.characterName === line.characterName)
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

interface CharacterInfo {
  color: string;
  sigil: string;
  profileImg: string | null;
  metaKey: string | null; // key in CHARACTER_META, if matched
}

interface PersonaInfo {
  displayName: string;
  color: string;
  profileImg: string | null;
  sigil: string;
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

  // charDir may come from token `[iseo:...]` as a bare KEY — resolve via nameMap.
  // Fall back to displayName's entry dir, then to charDir as literal path.
  let resolvedDir: string | undefined;
  if (charDir) {
    const tokenEntry = nameMap.get(charDir);
    resolvedDir = tokenEntry?.dir ?? charDir;
  } else {
    resolvedDir = entry?.dir;
  }

  // Try to infer meta key from resolvedDir (e.g. "characters/iseo" → "iseo")
  let metaKey: string | null = null;
  if (resolvedDir) {
    const parts = resolvedDir.split("/");
    const candidate = parts[parts.length - 1];
    if (candidate in CHARACTER_META) metaKey = candidate;
  }

  let profileImg: string | null = null;
  if (resolvedDir && imageKey) {
    profileImg = resolveImageUrl(ctx, resolvedDir, imageKey);
  }

  const sigil = metaKey ? CHARACTER_META[metaKey].sigil : "CIVILIAN · UNK";
  return { color, sigil, profileImg, metaKey };
}

function fallbackColor(name: string, map: Map<string, string>): string {
  if (map.has(name)) return map.get(name)!;
  const c = CHARACTER_COLORS[map.size % CHARACTER_COLORS.length];
  map.set(name, c);
  return c;
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

  // Sigil: explicit field or derived from `position` (peer/senior/junior/outsider)
  let sigil: string;
  if (fm.sigil) {
    sigil = String(fm.sigil);
  } else if (fm.position) {
    const pos = String(fm.position).toLowerCase();
    const posMap: Record<string, string> = {
      peer: "PEER · S-04",
      senior: "SENIOR · S-04",
      junior: "JUNIOR · S-04",
      outsider: "OUTSIDER · S-04",
    };
    sigil = posMap[pos] ?? `${pos.toUpperCase()} · S-04`;
  } else {
    sigil = "SUBJECT · S-04";
  }

  return { displayName, color, profileImg: info.profileImg, sigil };
}

// ── Render: Case header (sticky) ─────────────

function renderCaseHeader(
  stats: Stats,
  sectionCount: number,
  entryCount: number,
  ctx: RenderContext,
): string {
  const today = new Date();
  const caseNo = `${today.getFullYear().toString().slice(2)}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}`;
  const suspects = CHARACTER_ORDER.map((key) =>
    renderSuspectCard(key, stats, ctx),
  ).join("");

  return `
    <header class="ms-head">
      <div class="ms-head-scan"></div>
      <div class="ms-head-bar">
        <div class="ms-head-left">
          <span class="ms-head-stamp">CLASSIFIED</span>
          <span class="ms-head-case">SENTINEL INCIDENT · #${caseNo}-NTN</span>
        </div>
        <div class="ms-head-right">
          <span class="ms-head-live"><span class="ms-live-dot"></span>LIVE · MONITORED</span>
          <span class="ms-head-count">S${pad2(sectionCount)} · ${pad4(entryCount)} ENTRIES</span>
        </div>
      </div>
      <div class="ms-suspects">${suspects}</div>
    </header>`;
}

function renderSuspectCard(
  key: string,
  stats: Stats,
  ctx: RenderContext,
): string {
  const meta = CHARACTER_META[key];
  if (!meta) return "";
  const value = clampStat(stats[key as keyof Stats]);
  const { tone } = statusTier(value);
  const word = statusWord(value);
  const signed = value > 0 ? `+${value}` : `${value}`;
  const pct = ((value + 5) / 10) * 100;
  const fillLeft = Math.min(50, pct);
  const fillWidth = Math.abs(pct - 50);

  // Find avatar image
  const file = ctx.files.find(
    (f): f is TextFile =>
      f.type === "text" &&
      f.frontmatter?.name === key &&
      !!f.frontmatter?.["avatar-image"],
  );
  let profileSrc: string | null = null;
  if (file) {
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    profileSrc = resolveImageUrl(
      ctx,
      dir,
      String(file.frontmatter!["avatar-image"]),
    );
  }

  const profileHtml = profileSrc
    ? `<img class="ms-suspect-photo" src="${profileSrc}" alt="${escapeHtml(meta.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="ms-suspect-photo-fallback" style="display:none">${meta.name.charAt(0)}</div>`
    : `<div class="ms-suspect-photo-fallback">${meta.name.charAt(0)}</div>`;

  return `
    <article class="ms-suspect" data-tone="${tone}" style="--c: ${meta.color}">
      <div class="ms-suspect-photo-wrap">
        ${profileHtml}
        <span class="ms-suspect-id">S-${pad2(CHARACTER_ORDER.indexOf(key) + 1)}</span>
      </div>
      <div class="ms-suspect-body">
        <div class="ms-suspect-head">
          <span class="ms-suspect-name">${escapeHtml(meta.name)}</span>
          <span class="ms-suspect-status">${escapeHtml(word)}</span>
        </div>
        <div class="ms-suspect-role">${escapeHtml(meta.sigil)}</div>
        <div class="ms-suspect-gauge">
          <div class="ms-gauge-meta ms-gauge-meta--top">
            <span class="ms-gauge-value">${signed}</span>
          </div>
          <div class="ms-gauge-track">
            <div class="ms-gauge-center"></div>
            <div class="ms-gauge-fill" style="left:${fillLeft}%;width:${fillWidth}%"></div>
            <div class="ms-gauge-marker" style="left:${pct}%"></div>
          </div>
          <div class="ms-gauge-poles">
            <span class="ms-gauge-pole ms-gauge-pole--neg">${escapeHtml(METRIC_POLES[0])}</span>
            <span class="ms-gauge-pole ms-gauge-pole--pos">${escapeHtml(METRIC_POLES[1])}</span>
          </div>
        </div>
        <div class="ms-suspect-hover">
          <div class="ms-suspect-quote">${escapeHtml(meta.rolePhrase)}</div>
          <div class="ms-suspect-quirk">“${escapeHtml(meta.quirk)}”</div>
        </div>
      </div>
    </article>`;
}

// ── Render: Transcript entries ───────────────

function renderCharacterEntry(
  group: ChatGroup,
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
  seq: number,
  currentStats: Stats,
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
  const lines = group.lines
    .map((l) => formatInline(l))
    .join("<br/>");

  let stateChip = "";
  if (info.metaKey) {
    const v = currentStats[info.metaKey as keyof Stats];
    const word = v > 0 ? "신뢰" : v < 0 ? "경계" : "중립";
    const magnitude = Math.abs(v);
    const { tone } = statusTier(v);
    stateChip = `<span class="ms-chip" data-tone="${tone}">${word} ${magnitude}</span>`;
  }

  const profileHtml = info.profileImg
    ? `<img class="ms-entry-photo" src="${info.profileImg}" alt="${escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="ms-entry-photo-fallback" style="display:none">${name.charAt(0)}</div>`
    : `<div class="ms-entry-photo-fallback">${name.charAt(0)}</div>`;

  return `
    <article class="ms-entry" style="--c: ${info.color}">
      <aside class="ms-entry-meta">
        <span class="ms-seq">#${pad4(seq)}</span>
        <span class="ms-kind">TRANSCRIPT</span>
      </aside>
      <div class="ms-entry-rail"></div>
      <div class="ms-entry-body">
        <header class="ms-entry-head">
          <div class="ms-entry-photo-wrap">${profileHtml}</div>
          <div class="ms-entry-id">
            <span class="ms-entry-name">${escapeHtml(name)}</span>
            <span class="ms-entry-sigil">${escapeHtml(info.sigil)}</span>
          </div>
          ${stateChip}
        </header>
        <div class="ms-entry-text">${lines}</div>
      </div>
    </article>`;
}

function renderUserEntry(
  lines: string[],
  persona: PersonaInfo | null,
  seq: number,
): string {
  const body = lines
    .map((l) => formatInline(l))
    .join("<br/>");
  const name = persona?.displayName ?? "INTERVIEWER";
  const color = persona?.color ?? "#d4a574";
  const sigil = persona?.sigil ?? "INTERVIEWER · YOU";
  const photoHtml = persona?.profileImg
    ? `<img class="ms-entry-photo" src="${persona.profileImg}" alt="${escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="ms-entry-photo-fallback" style="display:none">${name.charAt(0)}</div>`
    : `<div class="ms-entry-photo-fallback">${name.charAt(0)}</div>`;

  return `
    <article class="ms-entry ms-entry--user" style="--c: ${color}">
      <aside class="ms-entry-meta">
        <span class="ms-seq">#${pad4(seq)}</span>
        <span class="ms-kind">INQUIRY</span>
      </aside>
      <div class="ms-entry-rail"></div>
      <div class="ms-entry-body">
        <header class="ms-entry-head">
          <div class="ms-entry-photo-wrap">${photoHtml}</div>
          <div class="ms-entry-id">
            <span class="ms-entry-name">${escapeHtml(name)}</span>
            <span class="ms-entry-sigil">${escapeHtml(sigil)}</span>
          </div>
        </header>
        <div class="ms-entry-text">${body}</div>
      </div>
    </article>`;
}

function renderAnalystNote(lines: string[], seq: number): string {
  const body = lines
    .map((l) => formatInline(l))
    .join("<br/>");
  return `
    <aside class="ms-note">
      <div class="ms-note-meta">
        <span class="ms-seq ms-seq--muted">#${pad4(seq)}</span>
        <span class="ms-kind ms-kind--note">ANALYST NOTE</span>
      </div>
      <div class="ms-note-text">${body}</div>
    </aside>`;
}

function renderSceneBreak(sectionNum: number): string {
  const label = `SECTION ${pad2(sectionNum)}`;
  return `
    <div class="ms-break" role="separator">
      <span class="ms-break-rule"></span>
      <span class="ms-break-label">${label}</span>
      <span class="ms-break-rule"></span>
    </div>`;
}

// ── Render: ANALYSIS UPDATE (stat-change) ────

interface StatDelta {
  key: string;
  delta: number;
  name: string;
}

// 단일 축 포맷: "한결 −2" / "이서 +1". 레거시 포맷 "한결 의심 +2"도 허용.
function parseStatDeltas(text: string): StatDelta[] {
  const parts = text
    .split(/[\u00b7,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: StatDelta[] = [];
  for (const p of parts) {
    // 이름 + (옵션 메트릭 이름) + 델타
    const m = p.match(/^(\S+)(?:\s+\S+)?\s+([+\-\u2212]\d+)$/);
    if (!m) continue;
    const [, name, raw] = m;
    const delta = parseInt(raw.replace("\u2212", "-"), 10);
    if (isNaN(delta)) continue;
    const key =
      Object.entries(CHARACTER_META).find(([, v]) => v.name === name)?.[0] ??
      name;
    out.push({ key, delta, name });
  }
  return out;
}

function renderAnalysisUpdate(text: string, seq: number): string {
  const deltas = parseStatDeltas(text);
  if (deltas.length === 0) {
    return `
      <div class="ms-update ms-update--plain">
        <span class="ms-kind ms-kind--update">ANALYSIS UPDATE · #${pad4(seq)}</span>
        <span class="ms-update-raw">${escapeHtml(text)}</span>
      </div>`;
  }

  const rows = deltas
    .map((d) => {
      const meta = CHARACTER_META[d.key];
      const color = meta?.color ?? "#d4a574";
      // 신뢰↑ = cool, 경계↑(신뢰↓) = warm. 모든 NPC 동일.
      const tone = d.delta > 0 ? "cool" : d.delta < 0 ? "warm" : "neutral";
      const sign = d.delta > 0 ? "+" : "";
      const abs = Math.min(5, Math.abs(d.delta));
      const barPct = (abs / 5) * 100;
      const arrow = d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "─";
      return `
        <div class="ms-delta-row" data-tone="${tone}" style="--c: ${color}">
          <span class="ms-delta-name">${escapeHtml(d.name)}</span>
          <span class="ms-delta-metric">${escapeHtml(METRIC_LABEL)}</span>
          <div class="ms-delta-bar"><div class="ms-delta-fill" style="width:${barPct}%"></div></div>
          <span class="ms-delta-value">${arrow} ${sign}${d.delta}</span>
        </div>`;
    })
    .join("");

  return `
    <section class="ms-update">
      <header class="ms-update-head">
        <span class="ms-kind ms-kind--update">ANALYSIS UPDATE</span>
        <span class="ms-seq ms-seq--update">#${pad4(seq)}</span>
      </header>
      <div class="ms-update-rows">${rows}</div>
    </section>`;
}

// ── Empty state ─────────────────────────────

function renderEmptyStandby(): string {
  return `
    <div class="ms-standby">
      <div class="ms-standby-grid"></div>
      <div class="ms-standby-core">
        <span class="ms-standby-dot"></span>
        <div class="ms-standby-label">AWAITING INITIAL CONTACT</div>
        <div class="ms-standby-sub">0 ENTRIES · STANDBY · 감시 대기</div>
        <div class="ms-standby-cursor">_</div>
      </div>
    </div>`;
}

// ── Styles ───────────────────────────────────

const STYLES = `<style>
  .ms-root {
    --ms-bg: #0a0e14;
    --ms-panel: #0e1319;
    --ms-panel-raised: #141b25;
    --ms-panel-hover: #18202c;
    --ms-edge: rgba(200,210,230,0.06);
    --ms-edge-strong: rgba(200,210,230,0.14);
    --ms-ink: #e6e2d7;
    --ms-ink-2: #a6a198;
    --ms-ink-3: #6f6d67;
    --ms-ink-4: #49474310;
    --ms-warm: #d4a574;
    --ms-cool: #7eb3cc;
    --ms-danger: #c87766;
    --ms-success: #a3b585;
    --ms-mono: "Fira Code", ui-monospace, monospace;

    background: var(--ms-bg);
    color: var(--ms-ink);
    min-height: 100%;
    position: relative;
    isolation: isolate;
  }

  .ms-root::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(126,179,204,0.04), transparent 60%),
      radial-gradient(ellipse 60% 40% at 80% 100%, rgba(212,165,116,0.03), transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .ms-root * { position: relative; z-index: 1; }

  /* ── STICKY HEADER ── */
  .ms-head {
    position: sticky;
    top: 0;
    z-index: 10;
    background: linear-gradient(180deg, rgba(10,14,20,0.96) 0%, rgba(10,14,20,0.92) 100%);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--ms-edge-strong);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .ms-head-scan {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--ms-cool) 20%, var(--ms-cool) 80%, transparent);
    opacity: 0.4;
    animation: ms-scan 6s ease-in-out infinite;
  }
  @keyframes ms-scan {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.6; }
  }

  .ms-head-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 24px;
    border-bottom: 1px solid var(--ms-edge);
    font-family: var(--ms-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
  }
  .ms-head-left, .ms-head-right {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .ms-head-stamp {
    padding: 2px 7px;
    border: 1px solid var(--ms-warm);
    color: var(--ms-warm);
    letter-spacing: 0.18em;
    font-weight: 600;
    text-transform: uppercase;
    transform: rotate(-1deg);
    opacity: 0.85;
  }
  .ms-head-case {
    color: var(--ms-ink-2);
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  .ms-head-live {
    color: var(--ms-ink-2);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
  }
  .ms-live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ms-danger);
    box-shadow: 0 0 8px var(--ms-danger);
    animation: ms-pulse 1.8s ease-in-out infinite;
  }
  @keyframes ms-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(0.7); }
  }
  .ms-head-count {
    color: var(--ms-ink-3);
    font-variant-numeric: tabular-nums;
  }

  /* ── SUSPECT STRIP ── */
  .ms-suspects {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--ms-edge);
  }
  .ms-suspect {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px 20px;
    background: var(--ms-panel);
    transition: background 0.4s ease;
    cursor: default;
    overflow: hidden;
  }
  .ms-suspect::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 70%, color-mix(in srgb, var(--c) 8%, transparent));
    opacity: 0;
    transition: opacity 0.4s ease;
    pointer-events: none;
  }
  .ms-suspect:hover { background: var(--ms-panel-hover); }
  .ms-suspect:hover::before { opacity: 1; }

  /* Tone coloring on border */
  .ms-suspect[data-tone="cool"] { box-shadow: inset 0 0 0 1px rgba(126,179,204,0.1); }
  .ms-suspect[data-tone="warm"] { box-shadow: inset 0 0 0 1px rgba(212,165,116,0.15); }
  .ms-suspect[data-tone="danger"] { box-shadow: inset 0 0 0 1px rgba(200,119,102,0.2); }

  .ms-suspect-photo-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .ms-suspect-photo {
    width: 64px;
    height: 80px;
    object-fit: cover;
    object-position: center 20%;
    border: 1px solid var(--ms-edge-strong);
    filter: grayscale(0.35) contrast(1.05);
    transition: filter 0.5s ease, border-color 0.3s ease;
  }
  .ms-suspect:hover .ms-suspect-photo {
    filter: grayscale(0) contrast(1.1);
    border-color: color-mix(in srgb, var(--c) 50%, var(--ms-edge-strong));
  }
  .ms-suspect-photo-fallback {
    width: 64px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--c) 12%, var(--ms-panel-raised));
    color: var(--c);
    font-size: 22px;
    font-weight: 700;
    border: 1px solid var(--ms-edge-strong);
    font-family: var(--ms-mono);
  }
  .ms-suspect-id {
    position: absolute;
    bottom: -6px;
    right: -6px;
    padding: 2px 5px;
    background: var(--ms-bg);
    color: var(--ms-ink-2);
    font-family: var(--ms-mono);
    font-size: 9px;
    letter-spacing: 0.12em;
    border: 1px solid var(--ms-edge-strong);
  }

  .ms-suspect-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ms-suspect-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .ms-suspect-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--ms-ink);
    letter-spacing: 0.02em;
  }
  .ms-suspect-status {
    font-family: var(--ms-mono);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    padding: 2px 6px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 25%, transparent);
    white-space: nowrap;
  }
  .ms-suspect-role {
    font-family: var(--ms-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--ms-ink-3);
    text-transform: uppercase;
  }

  .ms-suspect-gauge {
    margin-top: 2px;
  }
  .ms-gauge-track {
    position: relative;
    height: 4px;
    background: color-mix(in srgb, var(--ms-ink-3) 20%, transparent);
    overflow: visible;
  }
  .ms-gauge-center {
    position: absolute;
    left: 50%;
    top: -3px;
    width: 1px;
    height: 10px;
    background: var(--ms-ink-3);
    opacity: 0.5;
    transform: translateX(-50%);
  }
  .ms-gauge-fill {
    position: absolute;
    top: 0;
    height: 100%;
    background: var(--c);
    opacity: 0.55;
    transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ms-gauge-marker {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 10px;
    background: var(--c);
    box-shadow: 0 0 6px color-mix(in srgb, var(--c) 60%, transparent);
    transform: translateX(-50%);
    transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ms-gauge-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 6px;
    font-family: var(--ms-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .ms-gauge-meta--top {
    margin-top: 0;
    margin-bottom: 4px;
    justify-content: flex-end;
  }
  .ms-gauge-value {
    color: var(--c);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .ms-gauge-poles {
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    font-size: 10px;
    letter-spacing: 0.04em;
  }
  .ms-gauge-pole {
    color: var(--ms-ink-3);
    opacity: 0.7;
  }
  .ms-gauge-pole--pos {
    color: var(--c);
    opacity: 1;
  }

  .ms-suspect-hover {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.4s ease, opacity 0.3s ease, margin-top 0.3s ease;
    font-size: 11.5px;
    color: var(--ms-ink-2);
  }
  .ms-suspect:hover .ms-suspect-hover {
    max-height: 80px;
    opacity: 1;
    margin-top: 6px;
  }
  .ms-suspect-quote {
    color: var(--ms-ink-2);
    font-size: 11px;
    letter-spacing: 0.02em;
  }
  .ms-suspect-quirk {
    margin-top: 2px;
    font-style: italic;
    color: var(--ms-ink-3);
  }

  /* ── BODY ── */
  .ms-body {
    max-width: 780px;
    margin: 0 auto;
    padding: 32px 28px 80px;
  }

  /* ── TRANSCRIPT ENTRY ── */
  .ms-entry {
    display: grid;
    grid-template-columns: 80px 2px 1fr;
    gap: 16px;
    margin-bottom: 22px;
    padding-top: 4px;
  }
  .ms-entry-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 6px;
    font-family: var(--ms-mono);
    text-align: right;
    user-select: none;
  }
  .ms-seq {
    font-size: 11px;
    font-weight: 600;
    color: var(--ms-ink-2);
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }
  .ms-seq--muted { color: var(--ms-ink-3); }
  .ms-kind {
    font-size: 9px;
    letter-spacing: 0.15em;
    color: var(--ms-ink-3);
    text-transform: uppercase;
  }
  .ms-entry-rail {
    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 50%, transparent), transparent);
    width: 2px;
    margin-top: 8px;
  }
  .ms-entry-body {
    min-width: 0;
  }
  .ms-entry-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .ms-entry-photo-wrap {
    flex-shrink: 0;
  }
  .ms-entry-photo {
    width: 36px;
    height: 36px;
    object-fit: cover;
    object-position: center 20%;
    border-radius: 2px;
    border: 1px solid var(--ms-edge-strong);
    filter: grayscale(0.25);
  }
  .ms-entry:hover .ms-entry-photo {
    filter: grayscale(0);
    border-color: color-mix(in srgb, var(--c) 40%, var(--ms-edge-strong));
  }
  .ms-entry-photo-fallback {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--c) 15%, var(--ms-panel-raised));
    color: var(--c);
    font-weight: 700;
    border: 1px solid var(--ms-edge-strong);
    font-family: var(--ms-mono);
    font-size: 14px;
  }
  .ms-entry-id {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ms-entry-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--ms-ink);
    letter-spacing: 0.02em;
  }
  .ms-entry-sigil {
    font-family: var(--ms-mono);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    color: var(--c);
    opacity: 0.85;
    text-transform: uppercase;
  }
  .ms-chip {
    font-size: 11px;
    letter-spacing: 0.04em;
    padding: 3px 7px;
    color: var(--ms-ink-2);
    background: var(--ms-panel-raised);
    border: 1px solid var(--ms-edge);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .ms-chip[data-tone="cool"] { color: var(--ms-cool); border-color: color-mix(in srgb, var(--ms-cool) 25%, var(--ms-edge)); }
  .ms-chip[data-tone="warm"] { color: var(--ms-warm); border-color: color-mix(in srgb, var(--ms-warm) 25%, var(--ms-edge)); }
  .ms-chip[data-tone="danger"] { color: var(--ms-danger); border-color: color-mix(in srgb, var(--ms-danger) 30%, var(--ms-edge)); }

  .ms-entry-text {
    font-size: 15.5px;
    line-height: 1.75;
    color: var(--ms-ink);
    padding: 2px 0 0 46px;
  }
  .ms-stage {
    font-style: italic;
    color: var(--ms-ink-2);
    font-weight: 400;
  }
  .ms-entry strong {
    color: var(--ms-ink);
    font-weight: 600;
  }

  .ms-entry--user {
    --c: #d4a574;
  }
  .ms-entry--user .ms-entry-text {
    color: var(--ms-ink);
    font-weight: 500;
  }
  .ms-entry--user .ms-kind { color: var(--ms-warm); }

  /* ── ANALYST NOTE ── */
  .ms-note {
    display: grid;
    grid-template-columns: 80px 2px 1fr;
    gap: 16px;
    margin-bottom: 22px;
    padding-top: 4px;
  }
  .ms-note-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 4px;
    font-family: var(--ms-mono);
    text-align: right;
  }
  .ms-note::after {
    display: none;
  }
  .ms-note-text {
    grid-column: 3;
    font-style: italic;
    color: var(--ms-ink-2);
    font-size: 14.5px;
    line-height: 1.75;
    padding-left: 0;
    border-left: 2px solid var(--ms-edge-strong);
    padding-left: 16px;
    margin-left: -18px;
  }
  .ms-kind--note {
    color: var(--ms-cool);
    opacity: 0.9;
  }

  /* ── ANALYSIS UPDATE ── */
  .ms-update {
    margin: 28px 0;
    padding: 16px 20px;
    background: linear-gradient(180deg, rgba(212,165,116,0.05), rgba(212,165,116,0.02));
    border: 1px solid color-mix(in srgb, var(--ms-warm) 20%, transparent);
    border-radius: 2px;
    position: relative;
  }
  .ms-update::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--ms-warm);
    opacity: 0.8;
  }
  .ms-update-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    font-family: var(--ms-mono);
    font-size: 10px;
    letter-spacing: 0.15em;
  }
  .ms-kind--update {
    color: var(--ms-warm);
    font-weight: 700;
  }
  .ms-seq--update {
    color: var(--ms-ink-3);
    font-variant-numeric: tabular-nums;
  }
  .ms-update-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ms-delta-row {
    display: grid;
    grid-template-columns: 60px 50px 1fr 68px;
    gap: 12px;
    align-items: center;
    font-family: var(--ms-mono);
    font-size: 12px;
  }
  .ms-delta-name {
    color: var(--ms-ink);
    font-weight: 600;
    font-family: inherit;
  }
  .ms-delta-metric {
    color: var(--ms-ink-3);
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  .ms-delta-bar {
    position: relative;
    height: 4px;
    background: color-mix(in srgb, var(--ms-ink-3) 18%, transparent);
    overflow: hidden;
  }
  .ms-delta-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--c);
    opacity: 0.75;
    transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ms-delta-value {
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.05em;
  }
  .ms-delta-row[data-tone="cool"] .ms-delta-value { color: var(--ms-cool); }
  .ms-delta-row[data-tone="warm"] .ms-delta-value { color: var(--ms-warm); }
  .ms-delta-row[data-tone="danger"] .ms-delta-value { color: var(--ms-danger); }
  .ms-delta-row[data-tone="neutral"] .ms-delta-value { color: var(--ms-ink-2); }
  .ms-update-raw {
    color: var(--ms-ink-2);
    margin-left: 12px;
    font-family: var(--ms-mono);
    font-size: 11px;
  }
  .ms-update--plain { padding: 10px 16px; }

  /* ── SCENE BREAK ── */
  .ms-break {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 48px 0 32px;
    padding: 0 4px;
  }
  .ms-break-rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--ms-edge-strong) 50%, transparent);
  }
  .ms-break-label {
    font-family: var(--ms-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--ms-ink-3);
    text-transform: uppercase;
    padding: 2px 10px;
    border: 1px solid var(--ms-edge-strong);
    background: var(--ms-bg);
  }

  /* ── EVIDENCE PHOTO (결정적 연출) ── */
  .ms-evidence-wrap {
    display: grid;
    grid-template-columns: 80px 2px 1fr;
    gap: 16px;
    margin-bottom: 22px;
  }
  .ms-evidence-wrap > .ms-evidence {
    grid-column: 3;
  }
  .ms-evidence {
    display: block;
    margin: 20px auto 18px;
    max-width: 560px;
  }
  .ms-evidence-chrome {
    position: relative;
    padding: 10px;
    background: var(--ms-panel-raised);
    border: 1px solid var(--ms-edge-strong);
  }
  .ms-evidence-corner {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 1px solid var(--ms-warm);
    opacity: 0.7;
  }
  .ms-evidence-corner.tl { top: 4px; left: 4px; border-right: none; border-bottom: none; }
  .ms-evidence-corner.tr { top: 4px; right: 4px; border-left: none; border-bottom: none; }
  .ms-evidence-corner.bl { bottom: 4px; left: 4px; border-right: none; border-top: none; }
  .ms-evidence-corner.br { bottom: 4px; right: 4px; border-left: none; border-top: none; }

  .ms-evidence-monitor {
    position: relative;
    overflow: hidden;
    background: #000;
  }
  .ms-evidence-img {
    display: block;
    width: 100%;
    height: auto;
    filter: grayscale(0.15) contrast(1.08) brightness(0.96);
    transition: filter 0.6s ease, transform 0.8s ease;
  }
  .ms-evidence:hover .ms-evidence-img {
    filter: grayscale(0) contrast(1.12) brightness(1);
    transform: scale(1.01);
  }
  .ms-evidence-scan {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(126,179,204,0.25) 50%, transparent);
    animation: ms-monitor-scan 4s linear infinite;
    pointer-events: none;
  }
  @keyframes ms-monitor-scan {
    0% { top: 0; opacity: 0.5; }
    50% { opacity: 0.8; }
    100% { top: 100%; opacity: 0.5; }
  }

  .ms-evidence-rec {
    position: absolute;
    top: 8px;
    left: 10px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--ms-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.7);
    z-index: 2;
  }
  .ms-rec-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ms-danger);
    box-shadow: 0 0 6px var(--ms-danger);
    animation: ms-pulse 1.5s ease-in-out infinite;
  }
  .ms-evidence-id {
    position: absolute;
    bottom: 8px;
    right: 10px;
    font-family: var(--ms-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--ms-warm);
    text-shadow: 0 1px 2px rgba(0,0,0,0.7);
    padding: 2px 6px;
    background: rgba(0,0,0,0.5);
    border: 1px solid var(--ms-warm);
    z-index: 2;
  }

  .ms-evidence-caption {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 2px 2px;
    font-family: var(--ms-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
  }
  .ms-evidence-label {
    color: var(--ms-ink-3);
    text-transform: uppercase;
  }
  .ms-evidence-subject {
    color: var(--ms-ink-2);
    font-family: inherit;
    font-weight: 600;
  }

  /* ── EMPTY STANDBY ── */
  .ms-standby {
    position: relative;
    min-height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 80px 40px;
  }
  .ms-standby-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(126,179,204,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(126,179,204,0.04) 1px, transparent 1px);
    background-size: 32px 32px;
    opacity: 0.5;
    pointer-events: none;
  }
  .ms-standby-core {
    text-align: center;
    font-family: var(--ms-mono);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .ms-standby-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ms-warm);
    box-shadow: 0 0 12px var(--ms-warm);
    animation: ms-pulse 2s ease-in-out infinite;
  }
  .ms-standby-label {
    font-size: 14px;
    letter-spacing: 0.3em;
    color: var(--ms-ink-2);
    font-weight: 700;
  }
  .ms-standby-sub {
    font-size: 11px;
    letter-spacing: 0.2em;
    color: var(--ms-ink-3);
  }
  .ms-standby-cursor {
    margin-top: 10px;
    font-size: 20px;
    color: var(--ms-cool);
    animation: ms-blink 1s step-end infinite;
  }
  @keyframes ms-blink {
    50% { opacity: 0; }
  }

  /* ── PENDING STRIP ── ScrollArea viewport 하단(채팅바 바로 위)에 sticky */
  .ms-pending-strip {
    position: sticky;
    bottom: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background: color-mix(in srgb, var(--ms-panel-raised) 94%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--ms-warm) 50%, transparent);
    font-family: var(--ms-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--ms-warm);
    text-transform: uppercase;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .ms-pending-glyph {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ms-warm);
    box-shadow: 0 0 10px color-mix(in srgb, var(--ms-warm) 80%, transparent);
    animation: ms-pending-pulse 1.6s ease-in-out infinite;
    flex-shrink: 0;
  }
  .ms-pending-sep {
    color: color-mix(in srgb, var(--ms-warm) 55%, transparent);
  }
  .ms-pending-detail {
    color: var(--ms-ink);
    letter-spacing: 0.1em;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ms-pending-dots {
    display: inline-flex;
    gap: 3px;
    margin-left: auto;
  }
  .ms-pending-dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    animation: ms-pending-dot 1.2s ease-in-out infinite;
  }
  .ms-pending-dots i:nth-child(2) { animation-delay: 0.15s; }
  .ms-pending-dots i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes ms-pending-pulse {
    0%, 100% { opacity: 0.45; transform: scale(0.9); }
    50%      { opacity: 1;    transform: scale(1.1); }
  }
  @keyframes ms-pending-dot {
    0%, 80%, 100% { opacity: 0.25; }
    40%           { opacity: 1; }
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 720px) {
    .ms-suspects { grid-template-columns: 1fr; }
    .ms-entry, .ms-note {
      grid-template-columns: 56px 2px 1fr;
      gap: 10px;
    }
    .ms-entry-text { padding-left: 0; }
    .ms-body { padding: 24px 16px 64px; }
  }
</style>`;

// ── Pending strip ────────────────────────────
// 에이전트가 스트리밍 중일 때만 sticky 스트립을 그린다. 도구 실행 중이면
// 현재 도구 이름을 노출, 그 외는 "STREAMING RESPONSE".

function renderPendingStrip(stream: RenderStreamView): string {
  // 항상 DOM에 존재시키고 `hidden` 속성으로만 토글 — Idiomorph가 id 기반으로
  // 매칭하여 element를 유지하므로 ms-body 맨 위에 안정적으로 들어간다.
  const active = stream.toolCalls.find((tc) => tc.status !== "done");
  const detail = active
    ? `EXEC :: ${active.name.toUpperCase().replace(/_/g, " ")}`
    : "STREAMING RESPONSE";
  const hidden = stream.isStreaming ? "" : " hidden";
  return `
    <div id="ms-pending" class="ms-pending-strip"${hidden} role="status" aria-live="polite">
      <span class="ms-pending-glyph" aria-hidden="true"></span>
      <span class="ms-pending-label">SCANNING</span>
      <span class="ms-pending-sep">::</span>
      <span class="ms-pending-detail">${escapeHtml(detail)}</span>
      <span class="ms-pending-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    </div>`;
}

// ── Main renderer ────────────────────────────

export function render(ctx: RenderContext): string {
  const nameMap = buildNameMap(ctx);

  const sceneFiles = ctx.files
    .filter(
      (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const stats = parseStats(ctx);
  const hasAnyScene =
    sceneFiles.length > 0 &&
    sceneFiles.some((f) => f.content.trim().length > 0);

  const persona = resolvePersona(ctx, nameMap);
  const fallbackColorMap = new Map<string, string>();
  const evidence: EvidenceCounter = { n: 0 };

  if (!hasAnyScene) {
    return `${STYLES}
      <div class="ms-root">
        ${renderCaseHeader(stats, 0, 0, ctx)}
        <div class="ms-body">
          ${renderEmptyStandby()}
        </div>
        ${renderPendingStrip(ctx.stream)}
      </div>`;
  }

  // Accumulate body HTML + counts per scene (SECTION = scene file index)
  const bodyParts: string[] = [];
  let seq = 0;
  let entryCount = 0;
  let sectionNum = 0;

  for (const sceneFile of sceneFiles) {
    sectionNum += 1;
    if (sectionNum > 1) {
      bodyParts.push(renderSceneBreak(sectionNum));
    }

    const parsed = sceneFile.content
      .split("\n")
      .map(parseLine)
      .filter((l): l is ChatLine => l !== null)
      .map((l) => resolveAvatar(l, nameMap));
    const groups = groupLines(parsed);

    for (const g of groups) {
      switch (g.type) {
        case "divider":
          bodyParts.push(renderSceneBreak(sectionNum));
          break;
        case "stat-change":
          seq += 1;
          bodyParts.push(renderAnalysisUpdate(g.lines[0], seq));
          break;
        case "character":
          seq += 1;
          entryCount += 1;
          bodyParts.push(
            renderCharacterEntry(g, ctx, nameMap, fallbackColorMap, seq, stats),
          );
          break;
        case "user":
          seq += 1;
          entryCount += 1;
          bodyParts.push(renderUserEntry(g.lines, persona, seq));
          break;
        case "narration":
          seq += 1;
          bodyParts.push(renderAnalystNote(g.lines, seq));
          break;
        case "image":
          if (g.charDir && g.imageKey) {
            bodyParts.push(
              `<div class="ms-evidence-wrap">${renderEvidenceFigure(ctx, nameMap, evidence, g.charDir, g.imageKey)}</div>`,
            );
          }
          break;
      }
    }
  }

  return `${STYLES}
    <div class="ms-root">
      ${renderCaseHeader(stats, sectionNum, entryCount, ctx)}
      <div class="ms-body">
        ${bodyParts.join("\n")}
        <div data-chat-anchor></div>
      </div>
      ${renderPendingStrip(ctx.stream)}
    </div>`;
}
