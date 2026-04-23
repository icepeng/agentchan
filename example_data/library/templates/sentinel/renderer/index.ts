import type {
  AgentState,
  AssistantMessage,
  ProjectFile,
  TextFile,
  ToolCall,
} from "@agentchan/types";
import { Idiomorph } from "/api/host/lib/idiomorph.js";

const slug = location.pathname.match(/\/projects\/([^/]+)\//)?.[1] ?? "";
const filesBase = `/api/projects/${slug}/files`;
const root = document.getElementById("root")!;

let state: AgentState = {
  messages: [],
  pendingToolCalls: [],
  isStreaming: false,
};
let files: ProjectFile[] = [];

// ── Theme (setTheme RPC, mount once) ─────────
// 원본 renderer.ts의 theme() 반환값 그대로. prefersScheme: "dark"로 프로젝트 페이지에서만 다크 강제.
fetch(`/api/projects/${slug}/actions/setTheme`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    theme: {
      base: {
        void: "#0a0e14",
        base: "#0e1319",
        surface: "#141b25",
        elevated: "#18202c",
        accent: "#d4a574",
        fg: "#e6e2d7",
        fg2: "#a6a198",
        fg3: "#6f6d67",
        edge: "#c8d2e6",
      },
      prefersScheme: "dark",
    },
  }),
});

// ── Character meta ───────────────────────────

interface CharacterMeta {
  name: string;
  color: string;
  sigil: string;
  rolePhrase: string;
  quirk: string;
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

const METRIC_LABEL = "경계↔신뢰";
const METRIC_POLES: [string, string] = ["경계", "신뢰"];
const METRIC_DESCRIPTIONS: [string, string, string] = [
  "GUARDED — 적극적 경계",
  "NEUTRAL — 피상적 협력",
  "TRUSTED — 깊은 신뢰",
];

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

function resolveImageUrl(dir: string, imageKey: string): string {
  return `${filesBase}/${dir}/${imageKey}`;
}

function clampStat(n: number): number {
  return Math.max(-5, Math.min(5, n));
}

function pad4(n: number): string { return n.toString().padStart(4, "0"); }
function pad3(n: number): string { return n.toString().padStart(3, "0"); }
function pad2(n: number): string { return n.toString().padStart(2, "0"); }

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

function buildNameMap(): Map<string, NameMapEntry> {
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

// ── Inline formatting / evidence ────────────

interface EvidenceCounter {
  n: number;
}

function renderEvidenceFigure(
  nameMap: Map<string, NameMapEntry>,
  evidence: EvidenceCounter,
  charKey: string,
  key: string,
): string {
  const entry = nameMap.get(charKey);
  const dir = entry?.dir ?? charKey;
  const url = resolveImageUrl(dir, key);
  evidence.n += 1;
  const evNum = pad3(evidence.n);
  const hh = pad2(22 + Math.floor((evidence.n - 1) / 6));
  const mm = pad2((evidence.n * 7) % 60);
  const ss = pad2((evidence.n * 23) % 60);
  const charName = entry ? (CHARACTER_META[charKey]?.name ?? charKey) : charKey;
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
    .replace(/"(.+?)"/g, "“$1”")
    .replace(/\*(.+?)\*/g, '<em class="ms-stage">$1</em>');
}

// ── Stats ───────────────────────────────────

interface Stats {
  iseo: number;
  hangyeol: number;
  minji: number;
}

function parseStats(): Stats {
  const statsFile = files.find(
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
const STAT_CHANGE_LINE = /^\*\s*→\s+(.+?)\s*\*$/;

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };

  const statMatch = trimmed.match(STAT_CHANGE_LINE);
  if (statMatch) return { type: "stat-change", text: statMatch[1] };

  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };

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

  const charFallback = trimmed.match(/^([^\s:*][^:]{0,40}):\s*(["*“].*)$/);
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
  metaKey: string | null;
}

interface PersonaInfo {
  displayName: string;
  color: string;
  profileImg: string | null;
  sigil: string;
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
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): CharacterInfo {
  const entry = nameMap.get(displayName);
  const color = entry?.color || fallbackColor(displayName, fallbackColorMap);

  let resolvedDir: string | undefined;
  if (charDir) {
    const tokenEntry = nameMap.get(charDir);
    resolvedDir = tokenEntry?.dir ?? charDir;
  } else {
    resolvedDir = entry?.dir;
  }

  let metaKey: string | null = null;
  if (resolvedDir) {
    const parts = resolvedDir.split("/");
    const candidate = parts[parts.length - 1];
    if (candidate in CHARACTER_META) metaKey = candidate;
  }

  let profileImg: string | null = null;
  if (resolvedDir && imageKey) {
    profileImg = resolveImageUrl(resolvedDir, imageKey);
  }

  const sigil = metaKey ? CHARACTER_META[metaKey].sigil : "CIVILIAN · UNK";
  return { color, sigil, profileImg, metaKey };
}

function resolvePersona(nameMap: Map<string, NameMapEntry>): PersonaInfo | null {
  const personaFile = files.find(
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
    nameMap,
    isolatedColorMap,
  );
  const color = fm.color ? String(fm.color) : info.color;

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

// ── Case header ──────────────────────────────

function renderSuspectCard(key: string, stats: Stats): string {
  const meta = CHARACTER_META[key];
  if (!meta) return "";
  const value = clampStat(stats[key as keyof Stats]);
  const { tone } = statusTier(value);
  const word = statusWord(value);
  const signed = value > 0 ? `+${value}` : `${value}`;
  const pct = ((value + 5) / 10) * 100;
  const fillLeft = Math.min(50, pct);
  const fillWidth = Math.abs(pct - 50);

  const file = files.find(
    (f): f is TextFile =>
      f.type === "text" &&
      f.frontmatter?.name === key &&
      !!f.frontmatter?.["avatar-image"],
  );
  let profileSrc: string | null = null;
  if (file) {
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    profileSrc = resolveImageUrl(dir, String(file.frontmatter!["avatar-image"]));
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

function renderCaseHeader(
  stats: Stats,
  sectionCount: number,
  entryCount: number,
): string {
  const today = new Date();
  const caseNo = `${today.getFullYear().toString().slice(2)}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}`;
  const suspects = CHARACTER_ORDER.map((key) => renderSuspectCard(key, stats)).join("");

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

// ── Transcript entries ───────────────────────

function renderCharacterEntry(
  group: ChatGroup,
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
    nameMap,
    fallbackColorMap,
  );
  const lines = group.lines.map((l) => formatInline(l)).join("<br/>");

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
  const body = lines.map((l) => formatInline(l)).join("<br/>");
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
  const body = lines.map((l) => formatInline(l)).join("<br/>");
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

// ── ANALYSIS UPDATE ──────────────────────────

interface StatDelta {
  key: string;
  delta: number;
  name: string;
}

function parseStatDeltas(text: string): StatDelta[] {
  const parts = text
    .split(/[·,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: StatDelta[] = [];
  for (const p of parts) {
    const m = p.match(/^(\S+)(?:\s+\S+)?\s+([+\-−]\d+)$/);
    if (!m) continue;
    const [, name, raw] = m;
    const delta = parseInt(raw.replace("−", "-"), 10);
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

// ── Pending strip ────────────────────────────

function activeToolCalls(s: AgentState): ToolCall[] {
  const streaming: AssistantMessage | undefined = s.streamingMessage;
  const content = streaming?.content ?? [];
  return content.filter((b): b is ToolCall => b.type === "toolCall");
}

function renderPendingStrip(s: AgentState): string {
  const pendingSet = new Set(s.pendingToolCalls);
  const active = activeToolCalls(s).find((tc) => pendingSet.has(tc.id));
  const detail = active
    ? `EXEC :: ${active.name.toUpperCase().replace(/_/g, " ")}`
    : "STREAMING RESPONSE";
  const hidden = s.isStreaming ? "" : " hidden";
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

function buildHTML(): string {
  const nameMap = buildNameMap();

  const sceneFiles = files
    .filter((f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"))
    .sort((a, b) => a.path.localeCompare(b.path));

  const stats = parseStats();
  const hasAnyScene =
    sceneFiles.length > 0 &&
    sceneFiles.some((f) => f.content.trim().length > 0);

  const persona = resolvePersona(nameMap);
  const fallbackColorMap = new Map<string, string>();
  const evidence: EvidenceCounter = { n: 0 };

  if (!hasAnyScene) {
    return `
      <div class="ms-root">
        ${renderCaseHeader(stats, 0, 0)}
        <div class="ms-body">
          ${renderEmptyStandby()}
        </div>
        ${renderPendingStrip(state)}
      </div>`;
  }

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
            renderCharacterEntry(g, nameMap, fallbackColorMap, seq, stats),
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
              `<div class="ms-evidence-wrap">${renderEvidenceFigure(nameMap, evidence, g.charDir, g.imageKey)}</div>`,
            );
          }
          break;
      }
    }
  }

  return `
    <div class="ms-root">
      ${renderCaseHeader(stats, sectionNum, entryCount)}
      <div class="ms-body">
        ${bodyParts.join("\n")}
        <div data-chat-anchor></div>
      </div>
      ${renderPendingStrip(state)}
    </div>`;
}

function render(): void {
  Idiomorph.morph(root, buildHTML(), { morphStyle: "innerHTML" });
}

// ── Data loading ─────────────────────────────

async function loadFiles(): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/files`);
  files = await res.json();
}

// ── SSE ──────────────────────────────────────

const sse = new EventSource(`/api/projects/${slug}/state/stream`);
sse.addEventListener("snapshot", (e) => {
  state = JSON.parse((e as MessageEvent<string>).data).state;
  render();
});
sse.addEventListener("append", (e) => {
  const { message } = JSON.parse((e as MessageEvent<string>).data);
  state = { ...state, messages: [...state.messages, message] };
  render();
});
sse.addEventListener("streaming", (e) => {
  const { message } = JSON.parse((e as MessageEvent<string>).data);
  state = { ...state, streamingMessage: message, isStreaming: true };
  render();
});
sse.addEventListener("streaming_clear", () => {
  state = { ...state, streamingMessage: undefined, isStreaming: false };
  loadFiles().then(render);
});
sse.addEventListener("tool_pending_set", (e) => {
  const { ids } = JSON.parse((e as MessageEvent<string>).data);
  state = { ...state, pendingToolCalls: ids };
  render();
});

// ── Action click bridge ──────────────────────

root.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
  if (!target) return;
  const action = target.dataset.action;
  const text = target.dataset.text ?? target.textContent?.trim() ?? "";
  if (!text) return;
  if (action === "send" || action === "fill") {
    fetch(`/api/projects/${slug}/actions/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }
});

await loadFiles();
render();
