/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
import type { ReactElement } from "react";

// ── Inline type declarations (renderer transpile 독립) ──────────

type ProjectFile = Agentchan.ProjectFile;
type TextFile = Agentchan.TextFile;
type DataFile = Agentchan.DataFile;
type BinaryFile = Agentchan.BinaryFile;
type AgentState = Agentchan.RendererAgentState;
type RendererActions = Agentchan.RendererActions;

// pi-ai content blocks (inline)
interface TextContent {
  type: "text";
  text: string;
}
interface ThinkingContent {
  type: "thinking";
  thinking: string;
}
interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
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

// ── Renderer theme contract ──────────────────────────────────

type RendererTheme = Agentchan.RendererTheme;

// ── Renderer props (React component contract) ────────────────

interface RendererContentProps {
  state: AgentState;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
}

// ── Character meta (hardcoded for this template) ────────

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

// ── Renderer-owned theme ─────────────────────

function resolveRendererTheme(): RendererTheme {
  return {
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

function resolveImageUrl(
  baseUrl: string,
  dir: string,
  imageKey: string,
): string {
  return `${baseUrl}/files/${dir}/${imageKey}`;
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
  type:
    | "user"
    | "character"
    | "narration"
    | "divider"
    | "stat-change"
    | "image";
  characterName?: string;
  charDir?: string;
  imageKey?: string;
  text: string;
}

interface ChatGroup {
  type:
    | "user"
    | "character"
    | "narration"
    | "divider"
    | "stat-change"
    | "image";
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

// ── Inline formatting (React) ───────────────

function formatInline(text: string): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  // 1. smart quotes first on the raw text (doesn't conflict with markers)
  const quoted = text.replace(/"(.+?)"/g, "“$1”");
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = pattern.exec(quoted)) !== null) {
    if (match.index > cursor) {
      parts.push(quoted.slice(cursor, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={idx++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(
        <em key={idx++} className="ms-stage">
          {match[2]}
        </em>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < quoted.length) parts.push(quoted.slice(cursor));
  return parts;
}

function joinLinesWithBr(lines: string[]): ReactElement[] {
  const out: ReactElement[] = [];
  lines.forEach((line, i) => {
    out.push(<span key={`l-${i}`}>{formatInline(line)}</span>);
    if (i < lines.length - 1) out.push(<br key={`br-${i}`} />);
  });
  return out;
}

// ── Evidence figure ─────────────────────────

interface EvidenceCounter {
  n: number;
}

function EvidenceFigure(props: {
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  evidence: EvidenceCounter;
  slug: string;
  imageKey: string;
}): ReactElement {
  const { baseUrl, nameMap, evidence, slug, imageKey } = props;
  const entry = nameMap.get(slug);
  const dir = entry?.dir ?? slug;
  const url = resolveImageUrl(baseUrl, dir, imageKey);
  evidence.n += 1;
  const evNum = pad3(evidence.n);
  const hh = pad2(22 + Math.floor((evidence.n - 1) / 6));
  const mm = pad2((evidence.n * 7) % 60);
  const ss = pad2((evidence.n * 23) % 60);
  const charName = entry ? (CHARACTER_META[slug]?.name ?? slug) : slug;
  const emotion = imageKey.replace(/^assets\//, "").replace(/\.[a-z]+$/i, "");
  const captionEmotion = emotion.toUpperCase();

  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const fig = (e.currentTarget as HTMLElement).closest(
      ".ms-evidence",
    ) as HTMLElement | null;
    if (fig) fig.style.display = "none";
  };

  return (
    <figure className="ms-evidence" data-ev={evNum}>
      <div className="ms-evidence-chrome">
        <span className="ms-evidence-corner tl"></span>
        <span className="ms-evidence-corner tr"></span>
        <span className="ms-evidence-corner bl"></span>
        <span className="ms-evidence-corner br"></span>
        <div className="ms-evidence-monitor">
          <img
            className="ms-evidence-img"
            src={url}
            alt={captionEmotion}
            onError={onImgError}
          />
          <span className="ms-evidence-scan"></span>
          <span className="ms-evidence-rec">
            <span className="ms-rec-dot"></span>REC · {hh}:{mm}:{ss}
          </span>
          <span className="ms-evidence-id">EV-{evNum}</span>
        </div>
      </div>
      <figcaption className="ms-evidence-caption">
        <span className="ms-evidence-label">
          EVIDENCE · {captionEmotion}
        </span>
        <span className="ms-evidence-subject">{charName}</span>
      </figcaption>
    </figure>
  );
}

// ── Stat parsing ────────────────────────────

interface Stats {
  iseo: number;
  hangyeol: number;
  minji: number;
}

function parseStats(files: ProjectFile[]): Stats {
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
    return {
      type: "image",
      charDir: imgMatch[1],
      imageKey: imgMatch[2],
      text: "",
    };

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
      (line.type !== "character" || prev.characterName === line.characterName)
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

function resolveCharacterInfo(
  charDir: string | undefined,
  imageKey: string | undefined,
  displayName: string,
  files: ProjectFile[],
  baseUrl: string,
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
    profileImg = resolveImageUrl(baseUrl, resolvedDir, imageKey);
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
  files: ProjectFile[],
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
): PersonaInfo | null {
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
    files,
    baseUrl,
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

// ── Suspect card ─────────────────────────────

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  img.style.display = "none";
  const next = img.nextElementSibling as HTMLElement | null;
  if (next) next.style.display = "flex";
}

function SuspectCard(props: {
  cKey: string;
  stats: Stats;
  files: ProjectFile[];
  baseUrl: string;
}): ReactElement | null {
  const { cKey, stats, files, baseUrl } = props;
  const meta = CHARACTER_META[cKey];
  if (!meta) return null;
  const value = clampStat(stats[cKey as keyof Stats]);
  const { tone } = statusTier(value);
  const word = statusWord(value);
  const signed = value > 0 ? `+${value}` : `${value}`;
  const pct = ((value + 5) / 10) * 100;
  const fillLeft = Math.min(50, pct);
  const fillWidth = Math.abs(pct - 50);

  const file = files.find(
    (f): f is TextFile =>
      f.type === "text" &&
      f.frontmatter?.name === cKey &&
      !!f.frontmatter?.["avatar-image"],
  );
  let profileSrc: string | null = null;
  if (file) {
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    profileSrc = resolveImageUrl(
      baseUrl,
      dir,
      String(file.frontmatter!["avatar-image"]),
    );
  }

  const suspectStyle = { ["--c" as any]: meta.color } as React.CSSProperties;

  return (
    <article
      className="ms-suspect"
      data-tone={tone}
      style={suspectStyle}
    >
      <div className="ms-suspect-photo-wrap">
        {profileSrc ? (
          <>
            <img
              className="ms-suspect-photo"
              src={profileSrc}
              alt={meta.name}
              onError={hideOnError}
            />
            <div
              className="ms-suspect-photo-fallback"
              style={{ display: "none" }}
            >
              {meta.name.charAt(0)}
            </div>
          </>
        ) : (
          <div className="ms-suspect-photo-fallback">
            {meta.name.charAt(0)}
          </div>
        )}
        <span className="ms-suspect-id">
          S-{pad2(CHARACTER_ORDER.indexOf(cKey) + 1)}
        </span>
      </div>
      <div className="ms-suspect-body">
        <div className="ms-suspect-head">
          <span className="ms-suspect-name">{meta.name}</span>
          <span className="ms-suspect-status">{word}</span>
        </div>
        <div className="ms-suspect-role">{meta.sigil}</div>
        <div className="ms-suspect-gauge">
          <div className="ms-gauge-meta ms-gauge-meta--top">
            <span className="ms-gauge-value">{signed}</span>
          </div>
          <div className="ms-gauge-track">
            <div className="ms-gauge-center"></div>
            <div
              className="ms-gauge-fill"
              style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
            ></div>
            <div
              className="ms-gauge-marker"
              style={{ left: `${pct}%` }}
            ></div>
          </div>
          <div className="ms-gauge-poles">
            <span className="ms-gauge-pole ms-gauge-pole--neg">
              {METRIC_POLES[0]}
            </span>
            <span className="ms-gauge-pole ms-gauge-pole--pos">
              {METRIC_POLES[1]}
            </span>
          </div>
        </div>
        <div className="ms-suspect-hover">
          <div className="ms-suspect-quote">{meta.rolePhrase}</div>
          <div className="ms-suspect-quirk">
            {"“"}
            {meta.quirk}
            {"”"}
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Case header ─────────────────────────────

function CaseHeader(props: {
  stats: Stats;
  sectionCount: number;
  entryCount: number;
  files: ProjectFile[];
  baseUrl: string;
}): ReactElement {
  const { stats, sectionCount, entryCount, files, baseUrl } = props;
  const today = new Date();
  const caseNo = `${today.getFullYear().toString().slice(2)}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}`;

  return (
    <header className="ms-head">
      <div className="ms-head-scan"></div>
      <div className="ms-head-bar">
        <div className="ms-head-left">
          <span className="ms-head-stamp">CLASSIFIED</span>
          <span className="ms-head-case">
            SENTINEL INCIDENT · #{caseNo}-NTN
          </span>
        </div>
        <div className="ms-head-right">
          <span className="ms-head-live">
            <span className="ms-live-dot"></span>LIVE · MONITORED
          </span>
          <span className="ms-head-count">
            S{pad2(sectionCount)} · {pad4(entryCount)} ENTRIES
          </span>
        </div>
      </div>
      <div className="ms-suspects">
        {CHARACTER_ORDER.map((key) => (
          <SuspectCard
            key={key}
            cKey={key}
            stats={stats}
            files={files}
            baseUrl={baseUrl}
          />
        ))}
      </div>
    </header>
  );
}

// ── Character entry ─────────────────────────

function CharacterEntry(props: {
  group: ChatGroup;
  files: ProjectFile[];
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  fallbackColorMap: Map<string, string>;
  seq: number;
  currentStats: Stats;
}): ReactElement {
  const {
    group,
    files,
    baseUrl,
    nameMap,
    fallbackColorMap,
    seq,
    currentStats,
  } = props;
  const name = group.characterName!;
  const info = resolveCharacterInfo(
    group.charDir,
    group.imageKey,
    name,
    files,
    baseUrl,
    nameMap,
    fallbackColorMap,
  );

  let stateChip: ReactElement | null = null;
  if (info.metaKey) {
    const v = currentStats[info.metaKey as keyof Stats];
    const word = v > 0 ? "신뢰" : v < 0 ? "경계" : "중립";
    const magnitude = Math.abs(v);
    const { tone } = statusTier(v);
    stateChip = (
      <span className="ms-chip" data-tone={tone}>
        {word} {magnitude}
      </span>
    );
  }

  const entryStyle = { ["--c" as any]: info.color } as React.CSSProperties;

  return (
    <article className="ms-entry" style={entryStyle}>
      <aside className="ms-entry-meta">
        <span className="ms-seq">#{pad4(seq)}</span>
        <span className="ms-kind">TRANSCRIPT</span>
      </aside>
      <div className="ms-entry-rail"></div>
      <div className="ms-entry-body">
        <header className="ms-entry-head">
          <div className="ms-entry-photo-wrap">
            {info.profileImg ? (
              <>
                <img
                  className="ms-entry-photo"
                  src={info.profileImg}
                  alt={name}
                  onError={hideOnError}
                />
                <div
                  className="ms-entry-photo-fallback"
                  style={{ display: "none" }}
                >
                  {name.charAt(0)}
                </div>
              </>
            ) : (
              <div className="ms-entry-photo-fallback">{name.charAt(0)}</div>
            )}
          </div>
          <div className="ms-entry-id">
            <span className="ms-entry-name">{name}</span>
            <span className="ms-entry-sigil">{info.sigil}</span>
          </div>
          {stateChip}
        </header>
        <div className="ms-entry-text">{joinLinesWithBr(group.lines)}</div>
      </div>
    </article>
  );
}

// ── User entry ──────────────────────────────

function UserEntry(props: {
  lines: string[];
  persona: PersonaInfo | null;
  seq: number;
}): ReactElement {
  const { lines, persona, seq } = props;
  const name = persona?.displayName ?? "INTERVIEWER";
  const color = persona?.color ?? "#d4a574";
  const sigil = persona?.sigil ?? "INTERVIEWER · YOU";
  const entryStyle = { ["--c" as any]: color } as React.CSSProperties;

  return (
    <article className="ms-entry ms-entry--user" style={entryStyle}>
      <aside className="ms-entry-meta">
        <span className="ms-seq">#{pad4(seq)}</span>
        <span className="ms-kind">INQUIRY</span>
      </aside>
      <div className="ms-entry-rail"></div>
      <div className="ms-entry-body">
        <header className="ms-entry-head">
          <div className="ms-entry-photo-wrap">
            {persona?.profileImg ? (
              <>
                <img
                  className="ms-entry-photo"
                  src={persona.profileImg}
                  alt={name}
                  onError={hideOnError}
                />
                <div
                  className="ms-entry-photo-fallback"
                  style={{ display: "none" }}
                >
                  {name.charAt(0)}
                </div>
              </>
            ) : (
              <div className="ms-entry-photo-fallback">{name.charAt(0)}</div>
            )}
          </div>
          <div className="ms-entry-id">
            <span className="ms-entry-name">{name}</span>
            <span className="ms-entry-sigil">{sigil}</span>
          </div>
        </header>
        <div className="ms-entry-text">{joinLinesWithBr(lines)}</div>
      </div>
    </article>
  );
}

// ── Analyst note ────────────────────────────

function AnalystNote(props: {
  lines: string[];
  seq: number;
}): ReactElement {
  const { lines, seq } = props;
  return (
    <aside className="ms-note">
      <div className="ms-note-meta">
        <span className="ms-seq ms-seq--muted">#{pad4(seq)}</span>
        <span className="ms-kind ms-kind--note">ANALYST NOTE</span>
      </div>
      <div className="ms-note-text">{joinLinesWithBr(lines)}</div>
    </aside>
  );
}

// ── Scene break ─────────────────────────────

function SceneBreak(props: { sectionNum: number }): ReactElement {
  return (
    <div className="ms-break" role="separator">
      <span className="ms-break-rule"></span>
      <span className="ms-break-label">
        SECTION {pad2(props.sectionNum)}
      </span>
      <span className="ms-break-rule"></span>
    </div>
  );
}

// ── Analysis update ─────────────────────────

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

function AnalysisUpdate(props: {
  text: string;
  seq: number;
}): ReactElement {
  const { text, seq } = props;
  const deltas = parseStatDeltas(text);
  if (deltas.length === 0) {
    return (
      <div className="ms-update ms-update--plain">
        <span className="ms-kind ms-kind--update">
          ANALYSIS UPDATE · #{pad4(seq)}
        </span>
        <span className="ms-update-raw">{text}</span>
      </div>
    );
  }

  return (
    <section className="ms-update">
      <header className="ms-update-head">
        <span className="ms-kind ms-kind--update">ANALYSIS UPDATE</span>
        <span className="ms-seq ms-seq--update">#{pad4(seq)}</span>
      </header>
      <div className="ms-update-rows">
        {deltas.map((d, i) => {
          const meta = CHARACTER_META[d.key];
          const color = meta?.color ?? "#d4a574";
          const tone = d.delta > 0 ? "cool" : d.delta < 0 ? "warm" : "neutral";
          const sign = d.delta > 0 ? "+" : "";
          const abs = Math.min(5, Math.abs(d.delta));
          const barPct = (abs / 5) * 100;
          const arrow = d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "─";
          const rowStyle = {
            ["--c" as any]: color,
          } as React.CSSProperties;
          return (
            <div
              key={i}
              className="ms-delta-row"
              data-tone={tone}
              style={rowStyle}
            >
              <span className="ms-delta-name">{d.name}</span>
              <span className="ms-delta-metric">{METRIC_LABEL}</span>
              <div className="ms-delta-bar">
                <div
                  className="ms-delta-fill"
                  style={{ width: `${barPct}%` }}
                ></div>
              </div>
              <span className="ms-delta-value">
                {arrow} {sign}
                {d.delta}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Empty standby ───────────────────────────

function EmptyStandby(): ReactElement {
  return (
    <div className="ms-standby">
      <div className="ms-standby-grid"></div>
      <div className="ms-standby-core">
        <span className="ms-standby-dot"></span>
        <div className="ms-standby-label">AWAITING INITIAL CONTACT</div>
        <div className="ms-standby-sub">0 ENTRIES · STANDBY · 감시 대기</div>
        <div className="ms-standby-cursor">_</div>
      </div>
    </div>
  );
}

// ── Pending strip ───────────────────────────

function activeToolCalls(state: AgentState): ToolCall[] {
  const content = state.streamingMessage?.content ?? [];
  return content.filter((b): b is ToolCall => b.type === "toolCall");
}

function PendingStrip(props: { state: AgentState }): ReactElement {
  const { state } = props;
  const active = activeToolCalls(state).find((tc) =>
    state.pendingToolCalls.includes(tc.id),
  );
  const detail = active
    ? `EXEC :: ${active.name.toUpperCase().replace(/_/g, " ")}`
    : "STREAMING RESPONSE";
  return (
    <div
      id="ms-pending"
      className="ms-pending-strip"
      hidden={!state.isStreaming}
      role="status"
      aria-live="polite"
    >
      <span className="ms-pending-glyph" aria-hidden="true"></span>
      <span className="ms-pending-label">SCANNING</span>
      <span className="ms-pending-sep">::</span>
      <span className="ms-pending-detail">{detail}</span>
      <span className="ms-pending-dots" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </span>
    </div>
  );
}

// ── Styles ──────────────────────────────────

const STYLES = `
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

  /* ── EVIDENCE PHOTO ── */
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

  /* ── PENDING STRIP ── */
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
`;

// ── Main renderer ────────────────────────────

function RendererContent(props: RendererContentProps): ReactElement {
  const { state, files, baseUrl } = props;
  const nameMap = buildNameMap(files);

  const sceneFiles = files
    .filter(
      (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const stats = parseStats(files);
  const hasAnyScene =
    sceneFiles.length > 0 &&
    sceneFiles.some((f) => f.content.trim().length > 0);

  const persona = resolvePersona(files, baseUrl, nameMap);
  const fallbackColorMap = new Map<string, string>();
  const evidence: EvidenceCounter = { n: 0 };

  if (!hasAnyScene) {
    return (
      <div className="ms-root">
        <style>{STYLES}</style>
        <CaseHeader
          stats={stats}
          sectionCount={0}
          entryCount={0}
          files={files}
          baseUrl={baseUrl}
        />
        <div className="ms-body">
          <EmptyStandby />
        </div>
        <PendingStrip state={state} />
      </div>
    );
  }

  // Accumulate body elements
  const bodyParts: ReactElement[] = [];
  let seq = 0;
  let entryCount = 0;
  let sectionNum = 0;
  let partKey = 0;

  for (const sceneFile of sceneFiles) {
    sectionNum += 1;
    if (sectionNum > 1) {
      bodyParts.push(
        <SceneBreak key={`sb-${partKey++}`} sectionNum={sectionNum} />,
      );
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
          bodyParts.push(
            <SceneBreak key={`sb-${partKey++}`} sectionNum={sectionNum} />,
          );
          break;
        case "stat-change":
          seq += 1;
          bodyParts.push(
            <AnalysisUpdate
              key={`au-${partKey++}`}
              text={g.lines[0]}
              seq={seq}
            />,
          );
          break;
        case "character":
          seq += 1;
          entryCount += 1;
          bodyParts.push(
            <CharacterEntry
              key={`ce-${partKey++}`}
              group={g}
              files={files}
              baseUrl={baseUrl}
              nameMap={nameMap}
              fallbackColorMap={fallbackColorMap}
              seq={seq}
              currentStats={stats}
            />,
          );
          break;
        case "user":
          seq += 1;
          entryCount += 1;
          bodyParts.push(
            <UserEntry
              key={`ue-${partKey++}`}
              lines={g.lines}
              persona={persona}
              seq={seq}
            />,
          );
          break;
        case "narration":
          seq += 1;
          bodyParts.push(
            <AnalystNote
              key={`an-${partKey++}`}
              lines={g.lines}
              seq={seq}
            />,
          );
          break;
        case "image":
          if (g.charDir && g.imageKey) {
            bodyParts.push(
              <div key={`ev-${partKey++}`} className="ms-evidence-wrap">
                <EvidenceFigure
                  baseUrl={baseUrl}
                  nameMap={nameMap}
                  evidence={evidence}
                  slug={g.charDir}
                  imageKey={g.imageKey}
                />
              </div>,
            );
          }
          break;
      }
    }
  }

  return (
    <div className="ms-root">
      <style>{STYLES}</style>
      <CaseHeader
        stats={stats}
        sectionCount={sectionNum}
        entryCount={entryCount}
        files={files}
        baseUrl={baseUrl}
      />
      <div className="ms-body">
        {bodyParts}
        <div data-chat-anchor></div>
      </div>
      <PendingStrip state={state} />
    </div>
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

export function theme(_snapshot: Agentchan.RendererSnapshot): Agentchan.RendererTheme {
  return resolveRendererTheme();
}
