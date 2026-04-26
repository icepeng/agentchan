import { createRenderer, fileUrl, type BinaryFile, type DataFile, type ProjectFile, type RendererActions, type RendererAgentState, type RendererProps, type RendererSnapshot, type RendererTheme, type TextFile } from "@agentchan/renderer/react";
import "./index.css";
import type { ReactElement } from "react";

type AgentState = RendererAgentState;

interface RendererContentProps {
  state: AgentState;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
}

// ── Palette ──────────────────────────────────

const CHARACTER_COLORS = [
  "#2dd4bf",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#38bdf8",
  "#f87171",
];

// ── Helpers ──────────────────────────────────

function resolveImageUrl(baseUrl: string, dir: string, imageKey: string): string {
  return `${baseUrl}/files/${dir}/${imageKey}`;
}

// ── Types ────────────────────────────────────

interface ChatLine {
  type: "user" | "character" | "narration" | "divider";
  characterName?: string;
  charDir?: string;
  imageKey?: string;
  text: string;
}

interface ChatGroup {
  type: "user" | "character" | "narration" | "divider";
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

function resolveAvatar(line: ChatLine, nameMap: Map<string, NameMapEntry>): ChatLine {
  if (line.type !== "character" || line.charDir) return line;
  const entry = nameMap.get(line.characterName!);
  if (!entry) return line;
  return { ...line, charDir: entry.dir, imageKey: entry.avatarImage };
}

// ── Inline formatting ───────────────────────

const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;

function formatInline(
  text: string,
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
): (string | ReactElement)[] {
  // Replace smart quotes first (plain string transform)
  const quoted = text.replace(/"(.+?)"/g, "“$1”");

  // Tokenize: inline image, **bold**, *italic*
  const tokenRe = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]|\*\*(.+?)\*\*|\*(.+?)\*/g;
  const out: (string | ReactElement)[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  // Reset lastIndex since we reuse patterns
  INLINE_IMAGE.lastIndex = 0;
  while ((match = tokenRe.exec(quoted)) !== null) {
    if (match.index > cursor) out.push(quoted.slice(cursor, match.index));
    if (match[1] !== undefined && match[2] !== undefined) {
      const name = match[1];
      const key = match[2];
      const entry = nameMap.get(name);
      const dir = entry?.dir ?? name;
      const url = resolveImageUrl(baseUrl, dir, key);
      out.push(
        <div key={`img-${idx++}`} className="cr-illustration">
          <img
            className="cr-illustration-img"
            src={url}
            alt={key}
            onError={(e) => {
              const parent = (e.currentTarget as HTMLImageElement).parentElement;
              if (parent) parent.style.display = "none";
            }}
          />
        </div>,
      );
    } else if (match[3] !== undefined) {
      out.push(<strong key={`b-${idx++}`}>{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      out.push(
        <em key={`i-${idx++}`} className="cr-action">
          {match[4]}
        </em>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < quoted.length) out.push(quoted.slice(cursor));
  return out;
}

function joinWithBreaks(
  lines: string[],
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
): ReactElement[] {
  const out: ReactElement[] = [];
  lines.forEach((line, i) => {
    out.push(<span key={`l-${i}`}>{formatInline(line, baseUrl, nameMap)}</span>);
    if (i < lines.length - 1) out.push(<br key={`br-${i}`} />);
  });
  return out;
}

// ── Choices parsing ─────────────────────────

function extractChoices(content: string): { cleaned: string; choices: string[] } {
  const re = /\[CHOICES\]\s*\n([\s\S]*?)\n\s*\[\/CHOICES\]/g;
  let lastChoices: string[] = [];
  const cleaned = content.replace(re, (_match, body: string) => {
    lastChoices = body
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => /^\d+\.\s+/.test(l))
      .map((l: string) => l.replace(/^\d+\.\s+/, ""));
    return "";
  });
  return { cleaned, choices: lastChoices };
}

// ── Parsing ──────────────────────────────────

const IMAGE_TOKEN = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*/;

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };

  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };

  let rest = trimmed;
  let charDir: string | undefined;
  let imageKey: string | undefined;
  const tokenMatch = trimmed.match(IMAGE_TOKEN);
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

  const charFallback = rest.match(/^([^\s:][^:]{0,40}):\s*(["*“].*)$/);
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

interface CharacterInfo {
  color: string;
  avatar: ReactElement;
}

interface PersonaInfo {
  displayName: string;
  color: string;
  avatar: ReactElement;
}

function Avatar({
  src,
  alt,
  initial,
}: {
  src?: string;
  alt: string;
  initial: string;
}): ReactElement {
  if (src) {
    return (
      <>
        <img
          className="cr-avatar-img"
          src={src}
          alt={alt}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = "none";
            const next = img.nextElementSibling as HTMLElement | null;
            if (next) next.style.display = "flex";
          }}
        />
        <div className="cr-avatar" style={{ display: "none" }}>
          {initial}
        </div>
      </>
    );
  }
  return <div className="cr-avatar">{initial}</div>;
}

function resolveCharacterInfo(
  charDir: string | undefined,
  imageKey: string | undefined,
  displayName: string,
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): CharacterInfo {
  const entry = nameMap.get(displayName);
  const color = entry?.color || fallbackColor(displayName, fallbackColorMap);
  const initial = displayName.charAt(0).toUpperCase();

  const resolvedDir = charDir ?? entry?.dir;
  const src =
    resolvedDir && imageKey ? resolveImageUrl(baseUrl, resolvedDir, imageKey) : undefined;

  return {
    color,
    avatar: <Avatar src={src} alt={displayName} initial={initial} />,
  };
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
  const info = resolveCharacterInfo(dir, imageKey, displayName, baseUrl, nameMap, isolatedColorMap);
  const color = fm.color ? String(fm.color) : info.color;

  return { displayName, color, avatar: info.avatar };
}

// ── Render blocks ────────────────────────────

function CharacterBlock({
  group,
  baseUrl,
  nameMap,
  fallbackColorMap,
}: {
  group: ChatGroup;
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  fallbackColorMap: Map<string, string>;
}): ReactElement {
  const name = group.characterName!;
  const info = resolveCharacterInfo(
    group.charDir,
    group.imageKey,
    name,
    baseUrl,
    nameMap,
    fallbackColorMap,
  );
  return (
    <div className="cr-char" style={{ ["--c" as string]: info.color }}>
      <div className="cr-halo"></div>
      <div className="cr-char-body">
        {info.avatar}
        <div className="cr-char-content">
          <div className="cr-name">{name}</div>
          <div className="cr-bubble">{joinWithBreaks(group.lines, baseUrl, nameMap)}</div>
        </div>
      </div>
    </div>
  );
}

function UserBlock({
  lines,
  baseUrl,
  nameMap,
  persona,
}: {
  lines: string[];
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  persona: PersonaInfo | null;
}): ReactElement {
  if (persona) {
    return (
      <div className="cr-char" style={{ ["--c" as string]: persona.color }}>
        <div className="cr-halo"></div>
        <div className="cr-char-body">
          {persona.avatar}
          <div className="cr-char-content">
            <div className="cr-name">{persona.displayName}</div>
            <div className="cr-bubble">{joinWithBreaks(lines, baseUrl, nameMap)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-char cr-char--anon" style={{ ["--c" as string]: "var(--color-accent)" }}>
      <div className="cr-char-body">
        <div className="cr-char-content">
          <div className="cr-bubble">{joinWithBreaks(lines, baseUrl, nameMap)}</div>
        </div>
      </div>
    </div>
  );
}

function NarrationBlock({
  lines,
  baseUrl,
  nameMap,
}: {
  lines: string[];
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
}): ReactElement {
  return (
    <div className="cr-narr">
      <div className="cr-narr-text">{joinWithBreaks(lines, baseUrl, nameMap)}</div>
    </div>
  );
}

function DividerBlock(): ReactElement {
  return (
    <div className="cr-div">
      <span className="cr-dot"></span>
      <span className="cr-dot"></span>
      <span className="cr-dot"></span>
    </div>
  );
}

function ChoicesBlock({
  choices,
  onSend,
}: {
  choices: string[];
  onSend: (text: string) => void;
}): ReactElement | null {
  if (choices.length === 0) return null;
  return (
    <div className="cr-choices">
      {choices.map((c, i) => (
        <button
          key={`${i}-${c}`}
          type="button"
          className="cr-choice-btn"
          onClick={() => onSend(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function EmptyBlock(): ReactElement {
  return (
    <div className="cr-empty">
      <div className="cr-empty-rule"></div>
      <div className="cr-empty-text">모험이 기다리고 있습니다</div>
      <div className="cr-empty-rule"></div>
    </div>
  );
}

// ── Styles ───────────────────────────────────


// ── Main renderer ────────────────────────────

function RendererContent({ files, baseUrl, actions }: RendererContentProps): ReactElement {
  const nameMap = buildNameMap(files);

  const sceneFiles = files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );

  if (sceneFiles.length === 0) {
    return (
      <>
        <EmptyBlock />
      </>
    );
  }

  const allContent = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const { cleaned, choices } = extractChoices(allContent);

  const fallbackColorMap = new Map<string, string>();
  const persona = resolvePersona(files, baseUrl, nameMap);

  const parsed = cleaned
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0) {
    return (
      <>
        <EmptyBlock />
      </>
    );
  }

  return (
    <>
      <div className="cr-root">
        {groups.map((g, i) => {
          const key = `g-${i}`;
          switch (g.type) {
            case "user":
              return (
                <UserBlock
                  key={key}
                  lines={g.lines}
                  baseUrl={baseUrl}
                  nameMap={nameMap}
                  persona={persona}
                />
              );
            case "character":
              return (
                <CharacterBlock
                  key={key}
                  group={g}
                  baseUrl={baseUrl}
                  nameMap={nameMap}
                  fallbackColorMap={fallbackColorMap}
                />
              );
            case "narration":
              return (
                <NarrationBlock key={key} lines={g.lines} baseUrl={baseUrl} nameMap={nameMap} />
              );
            case "divider":
              return <DividerBlock key={key} />;
          }
        })}
        <ChoicesBlock choices={choices} onSend={(t) => actions.send(t)} />
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

export const renderer = createRenderer(Renderer);
