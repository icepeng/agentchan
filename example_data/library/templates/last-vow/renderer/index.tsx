/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
import "./index.css";
import type { ReactElement } from "react";

// ── Local renderer data shapes ──────────

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
type AssistantContentBlock = TextContent | ThinkingContent | ToolCall;

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
    color: "#7a8fa6",
    sigil: "PLANNER · S-01",
    rolePhrase: "32 · 라비앙 로즈 수석 플래너",
    quirk: "태블릿 일정표를 손톱으로 두 번 두드린다",
  },
  hangyeol: {
    name: "한결",
    color: "#b9473f",
    sigil: "GROOM · S-02",
    rolePhrase: "31 · 신랑 · 외식 프랜차이즈 2세",
    quirk: "커프스 단추와 구겨진 부토니에를 만진다",
  },
  minji: {
    name: "민지",
    color: "#8aa66a",
    sigil: "SONG · S-03",
    rolePhrase: "29 · 신부의 절친 · 축가 진행자",
    quirk: "축가 큐시트 모서리를 접고 또 접는다",
  },
};

const CHARACTER_ORDER = ["iseo", "hangyeol", "minji"];
const STARTER_CHOICES: ChoiceOption[] = [
  {
    label: "내가 왜 의심받는지부터 보여줘",
    action: "내가 왜 의심받는지부터 보여줘",
  },
  {
    label: "유라와 마지막으로 나눈 말을 떠올린다",
    action: "유라와 마지막으로 나눈 말을 떠올리고, 그 말이 왜 나를 의심스럽게 만드는지 확인한다",
  },
  {
    label: "세 사람에게 유라와의 관계를 묻는다",
    action: "이서, 한결, 민지에게 각자 유라와 어떤 관계였는지 말하게 한다",
  },
];

const METRIC_LABEL = "태도";
const METRIC_POLES: [string, string] = ["의심", "협조"];
const METRIC_DESCRIPTIONS: [string, string, string] = [
  "SUSPECTING — 유저를 의심",
  "UNCERTAIN — 불안한 중립",
  "COOPERATING — 조건부 협조",
];

// ── Renderer-owned theme ─────────────────────

function resolveRendererTheme(): RendererTheme {
  return {
    base: {
      void: "#0a0e14",
      base: "#11100f",
      surface: "#1a1716",
      elevated: "#221d1b",
      accent: "#d9b16f",
      fg: "#f0e8dc",
      fg2: "#b8aaa0",
      fg3: "#7d746d",
      edge: "#f0d7be",
    },
    prefersScheme: "dark",
  };
}

// ── Palette ──────────────────────────────────

const CHARACTER_COLORS = [
  "#7a8fa6",
  "#d4a574",
  "#8aa66a",
  "#b9473f",
  "#c88c8c",
  "#b78a4a",
  "#6f8f88",
  "#c56f5e",
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
  userSuspicion: number;
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
    userSuspicion: read("user_suspicion"),
  };
}

interface ChoiceOption {
  label: string;
  action: string;
}

function parseChoicesMarker(content: string): ChoiceOption[] {
  const blocks = [
    ...content.matchAll(/\[CHOICES\]\n([\s\S]*?)\n?\[\/CHOICES\]/g),
  ];
  if (blocks.length === 0) return [];
  const body = blocks[blocks.length - 1]?.[1] ?? "";
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
    if (fields.label && fields.action) {
      options.push({ label: fields.label, action: fields.action });
    }
  }
  return options;
}

function stripChoiceBlocks(content: string): string {
  return content.replace(/\[CHOICES\]\n[\s\S]*?\n?\[\/CHOICES\]\n?/g, "");
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

// ── Sticky trust tracker ─────────────────────

function TrustStrip(props: { stats: Stats }): ReactElement {
  const { stats } = props;
  return (
    <aside className="ms-trust-strip" aria-label="용의자 신뢰 게이지">
      <span className="ms-trust-title">의심↔협조</span>
      <div className="ms-trust-items">
        {CHARACTER_ORDER.map((key) => {
          const meta = CHARACTER_META[key]!;
          const value = clampStat(stats[key as keyof Stats]);
          const pct = ((value + 5) / 10) * 100;
          const fillLeft = Math.min(50, pct);
          const fillWidth = Math.abs(pct - 50);
          const signed = value > 0 ? `+${value}` : `${value}`;
          const itemStyle = {
            ["--c" as any]: meta.color,
          } as React.CSSProperties;
          return (
            <div key={key} className="ms-trust-item" style={itemStyle}>
              <span className="ms-trust-name">{meta.name}</span>
              <span className="ms-trust-bar" aria-hidden="true">
                <span className="ms-trust-zero"></span>
                <span
                  className="ms-trust-fill"
                  style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
                ></span>
                <span
                  className="ms-trust-marker"
                  style={{ left: `${pct}%` }}
                ></span>
              </span>
              <span className="ms-trust-value">{signed}</span>
            </div>
          );
        })}
      </div>
    </aside>
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
      <div className="ms-veil" aria-hidden="true">
        <span className="ms-veil-fold ms-veil-fold--left"></span>
        <span className="ms-veil-fold ms-veil-fold--right"></span>
        <span className="ms-glass-mark"></span>
      </div>
      <div className="ms-head-story">
        <div className="ms-head-copy">
          <span className="ms-head-stamp">SEALED VENUE</span>
          <h1 className="ms-title">Last Vow</h1>
          <p className="ms-dek">
            서약 직전 쓰러진 신부. 마지막 목격자인 당신. 경찰이 도착하기 전,
            이 결혼식장은 하나의 증언대가 된다.
          </p>
        </div>
        <div className="ms-head-facts" aria-label="사건 상태">
          <span>
            CASE #{caseNo}-WED
          </span>
          <span>
            의심 압력 {Math.max(0, Math.min(5, stats.userSuspicion))}/5
          </span>
          <span>
            경찰 도착 90분 전
          </span>
          <span>
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
    const word = v > 0 ? "협조" : v < 0 ? "의심" : "중립";
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
        <span className="ms-kind ms-kind--note">CASE NOTE</span>
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

// ── Next choices ─────────────────────────────

function NextChoices(props: {
  options: ChoiceOption[];
  onFill: (text: string) => void;
}): ReactElement | null {
  const { options, onFill } = props;
  if (options.length === 0) return null;
  return (
    <section className="ms-choice" role="group" aria-label="다음 행동">
      <header className="ms-choice-head">
        <span className="ms-choice-glyph" aria-hidden="true">
          ◆
        </span>
        <span className="ms-choice-title">다음 행동</span>
        <span className="ms-choice-hint">
          버튼을 누르면 입력창에 채워집니다. 자유 입력도 가능합니다.
        </span>
      </header>
      <div className="ms-choice-list">
        {options.map((opt, i) => (
          <button
            key={`${opt.label}-${i}`}
            type="button"
            className="ms-choice-option"
            style={{ ["--i" as any]: i }}
            onClick={() => onFill(opt.action)}
          >
            <span className="ms-choice-label">{opt.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Empty standby ───────────────────────────

function EmptyStandby(props: { onFill: (text: string) => void }): ReactElement {
  return (
    <div className="ms-standby" aria-label="Last Vow 시작 화면">
      <div className="ms-standby-visual" aria-hidden="true">
        <span className="ms-standby-veil"></span>
        <span className="ms-standby-aisle"></span>
      </div>
      <div className="ms-standby-core">
        <p className="ms-standby-kicker">라비앙 로즈 · 예식 12분 전</p>
        <h2 className="ms-standby-title">Last Vow</h2>
        <p className="ms-standby-line">
          신부대기실의 문이 닫히기 전, 유라는 당신 이름을 마지막으로 불렀다.
          어젯밤의 말다툼을 아는 사람은 아직 없고, 모두가 당신의 대답을
          기다린다.
        </p>
        <div className="ms-standby-actions" role="group" aria-label="첫 행동">
          {STARTER_CHOICES.map((choice, i) => (
            <button
              key={choice.label}
              type="button"
              className="ms-standby-action"
              style={{ ["--i" as any]: i }}
              onClick={() => props.onFill(choice.action)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Pending strip ───────────────────────────

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

const PENDING_STEPS = ["질문 접수", "증거 확인", "기록 갱신", "진술 구성"];

function pendingStage(active: ToolCall | undefined): {
  index: number;
  label: string;
  detail: string;
  mode: "thinking" | "evidence" | "record" | "answer";
} {
  if (!active) {
    return {
      index: 3,
      label: "진술 구성",
      detail: "답변을 정리하는 중",
      mode: "answer",
    };
  }

  const name = active.name.toLowerCase();
  if (
    name.includes("read") ||
    name.includes("grep") ||
    name.includes("tree") ||
    name.includes("search")
  ) {
    return {
      index: 1,
      label: "증거 확인",
      detail: `${active.name} 결과를 대조하는 중`,
      mode: "evidence",
    };
  }
  if (
    name.includes("write") ||
    name.includes("edit") ||
    name.includes("append")
  ) {
    return {
      index: 2,
      label: "기록 갱신",
      detail: `${active.name}로 사건 기록을 반영하는 중`,
      mode: "record",
    };
  }
  return {
    index: 0,
    label: "질문 접수",
    detail: `${active.name} 호출을 준비하는 중`,
    mode: "thinking",
  };
}

function PendingStrip(props: { state: AgentState }): ReactElement {
  const { state } = props;
  const active = activeToolCalls(state).find((tc) =>
    state.pendingToolCalls.includes(tc.id),
  );
  const stage = pendingStage(active);
  return (
    <div
      id="ms-pending"
      className="ms-pending-strip"
      data-mode={stage.mode}
      hidden={!state.isStreaming}
      role="status"
      aria-live="polite"
    >
      <span className="ms-pending-scope" aria-hidden="true">
        <span className="ms-pending-ring"></span>
        <span className="ms-pending-needle"></span>
      </span>
      <div className="ms-pending-copy">
        <span className="ms-pending-label">{stage.label}</span>
        <span className="ms-pending-detail">{stage.detail}</span>
      </div>
      <div className="ms-pending-steps" aria-hidden="true">
        {PENDING_STEPS.map((step, i) => (
          <span
            key={step}
            className="ms-pending-step"
            data-active={i === stage.index ? "true" : "false"}
            data-done={i < stage.index ? "true" : "false"}
            style={{ ["--i" as any]: i }}
          >
            {step}
          </span>
        ))}
      </div>
      <span className="ms-pending-beam" aria-hidden="true"></span>
    </div>
  );
}

// ── Styles ──────────────────────────────────


// ── Main renderer ────────────────────────────

function RendererContent(props: RendererContentProps): ReactElement {
  const { state, files, baseUrl, actions } = props;
  const nameMap = buildNameMap(files);

  const sceneFiles = files
    .filter(
      (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const stats = parseStats(files);
  const allSceneContent = sceneFiles.map((f) => f.content).join("\n\n");
  const choices = parseChoicesMarker(allSceneContent);
  const hasAnyScene =
    sceneFiles.length > 0 &&
    sceneFiles.some((f) => f.content.trim().length > 0);

  const persona = resolvePersona(files, baseUrl, nameMap);
  const fallbackColorMap = new Map<string, string>();
  const evidence: EvidenceCounter = { n: 0 };

  if (!hasAnyScene) {
    return (
      <div className="ms-root">
        <EmptyStandby onFill={actions.fill} />
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

    const parsed = stripChoiceBlocks(sceneFile.content)
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
      <CaseHeader
        stats={stats}
        sectionCount={sectionNum}
        entryCount={entryCount}
        files={files}
        baseUrl={baseUrl}
      />
      <TrustStrip stats={stats} />
      <div className="ms-body">
        {bodyParts}
        <NextChoices options={choices} onFill={actions.fill} />
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
