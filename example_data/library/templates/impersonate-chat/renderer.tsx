import type { ReactElement, ReactNode } from "react";

interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
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
interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
}
type ProjectFile = TextFile | DataFile | BinaryFile;

interface RendererActions {
  send(text: string): void;
  fill(text: string): void;
  setTheme(theme: unknown): void;
}
interface RendererProps {
  state: unknown;
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

    // Map all known names to this entry
    if (fm.names) {
      for (const raw of String(fm.names).split(",")) {
        const name = raw.trim();
        if (name && !map.has(name)) map.set(name, entry);
      }
    }
    const dn = fm["display-name"];
    if (dn && !map.has(String(dn))) map.set(String(dn), entry);

    // Also map the frontmatter name field
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
const INLINE_FORMAT = /\*\*(.+?)\*\*|"(.+?)"|\*(.+?)\*|\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;

function formatInline(
  text: string,
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
  keyPrefix: string,
): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  let cursor = 0;
  let idx = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(INLINE_FORMAT.source, "g");

  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-s-${idx++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(`“${match[2]}”`);
    } else if (match[3] !== undefined) {
      parts.push(
        <em key={`${keyPrefix}-e-${idx++}`} className="cr-action">
          {match[3]}
        </em>,
      );
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const name = match[4];
      const key = match[5];
      const entry = nameMap.get(name);
      const dir = entry?.dir ?? name;
      const url = resolveImageUrl(baseUrl, dir, key);
      parts.push(
        <div key={`${keyPrefix}-img-${idx++}`} className="cr-illustration">
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
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  // Satisfy the unused-regex-warning for INLINE_IMAGE (kept for doc parity)
  void INLINE_IMAGE;
  return parts;
}

function joinWithBreaks(
  lines: string[],
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
  keyPrefix: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    out.push(
      <span key={`${keyPrefix}-line-${i}`}>
        {formatInline(line, baseUrl, nameMap, `${keyPrefix}-${i}`)}
      </span>,
    );
    if (i < lines.length - 1) out.push(<br key={`${keyPrefix}-br-${i}`} />);
  });
  return out;
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
    charDir = tokenMatch[1]; // Will be resolved via nameMap later
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
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): CharacterInfo {
  const entry = nameMap.get(displayName);
  const color = entry?.color || fallbackColor(displayName, fallbackColorMap);
  const initial = displayName.charAt(0).toUpperCase();

  const resolvedDir = charDir ?? entry?.dir;
  if (resolvedDir && imageKey) {
    const src = resolveImageUrl(baseUrl, resolvedDir, imageKey);
    const avatar = (
      <>
        <img
          className="cr-avatar-img"
          src={src}
          alt={displayName}
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
    return { color, avatar };
  }

  return {
    color,
    avatar: <div className="cr-avatar">{initial}</div>,
  };
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
  groupKey,
}: {
  group: ChatGroup;
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  fallbackColorMap: Map<string, string>;
  groupKey: string;
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
          <div className="cr-bubble">
            {joinWithBreaks(group.lines, baseUrl, nameMap, groupKey)}
          </div>
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
  groupKey,
}: {
  lines: string[];
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  persona: PersonaInfo | null;
  groupKey: string;
}): ReactElement {
  const content = joinWithBreaks(lines, baseUrl, nameMap, groupKey);

  if (persona) {
    return (
      <div className="cr-char" style={{ ["--c" as string]: persona.color }}>
        <div className="cr-halo"></div>
        <div className="cr-char-body">
          {persona.avatar}
          <div className="cr-char-content">
            <div className="cr-name">{persona.displayName}</div>
            <div className="cr-bubble">{content}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-char cr-char--anon" style={{ ["--c" as string]: "var(--color-accent)" }}>
      <div className="cr-char-body">
        <div className="cr-char-content">
          <div className="cr-bubble">{content}</div>
        </div>
      </div>
    </div>
  );
}

function NarrationBlock({
  lines,
  baseUrl,
  nameMap,
  groupKey,
}: {
  lines: string[];
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  groupKey: string;
}): ReactElement {
  return (
    <div className="cr-narr">
      <div className="cr-narr-text">{joinWithBreaks(lines, baseUrl, nameMap, groupKey)}</div>
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

function EmptyBlock(): ReactElement {
  return (
    <div className="cr-empty">
      <div className="cr-empty-rule"></div>
      <div className="cr-empty-text">무대가 기다리고 있습니다</div>
      <div className="cr-empty-rule"></div>
    </div>
  );
}

// ── Styles ───────────────────────────────────

const STYLES = `
  .cr-action { font-style: normal; }
  .cr-char { position: relative; margin-bottom: 32px; padding: 2px 0; }
  .cr-halo { position: absolute; left: -40px; top: 50%; transform: translateY(-50%); width: 220px; height: 120px; border-radius: 50%; background: radial-gradient(ellipse, var(--c) 0%, transparent 70%); opacity: 0.05; pointer-events: none; transition: opacity 0.5s ease; z-index: 0; }
  .cr-char:hover .cr-halo { opacity: 0.1; }
  .cr-char-body { display: flex; align-items: flex-start; gap: 12px; position: relative; z-index: 1; }
  .cr-avatar-img { flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px; object-fit: cover; box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 15%, transparent); transition: box-shadow 0.3s ease; margin-top: 2px; }
  .cr-char:hover .cr-avatar-img { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent); }
  .cr-avatar { flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; background: color-mix(in srgb, var(--c) 10%, transparent); color: var(--c); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 15%, transparent); transition: box-shadow 0.3s ease; margin-top: 2px; }
  .cr-char:hover .cr-avatar { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent); }
  .cr-char-content { max-width: 85%; min-width: 0; }
  .cr-name { font-family: var(--font-family-display); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--c); opacity: 0.8; margin-bottom: 4px; transition: opacity 0.2s ease; }
  .cr-char:hover .cr-name { opacity: 1; }
  .cr-bubble { padding: 8px 12px; border-radius: 8px; background: transparent; border: none; font-size: 16px; line-height: 1.8; color: var(--color-fg); transition: background 0.3s ease; }
  .cr-char:hover .cr-bubble { background: color-mix(in srgb, var(--c) 3%, transparent); }
  .cr-char--anon .cr-bubble { padding-left: 0; }
  .cr-narr { margin-bottom: 32px; padding: 0 12px; }
  .cr-narr-text { font-size: 15px; color: var(--color-fg-2); line-height: 1.8; }
  .cr-div { display: flex; align-items: center; justify-content: center; margin: 56px 0; gap: 7px; color: var(--color-fg-4); }
  .cr-dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }
  .cr-dot:nth-child(2) { opacity: 0.35; }
  .cr-illustration { margin: 12px 0; text-align: center; }
  .cr-illustration-img { max-width: 100%; max-height: 360px; border-radius: 8px; object-fit: contain; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08); }
  .cr-root { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; min-height: 100%; justify-content: flex-end; padding-bottom: 16px; }
  .cr-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 14px; opacity: 0.3; }
  .cr-empty-rule { width: 28px; height: 1px; background: var(--color-fg-4); }
  .cr-empty-text { font-family: var(--font-family-display); font-size: 12px; color: var(--color-fg-3); letter-spacing: 0.08em; }
`;

// ── Main renderer ────────────────────────────

export default function Renderer({ files, baseUrl }: RendererProps): ReactElement {
  const nameMap = buildNameMap(files);

  // Scene files = text files in scenes/ directory
  const sceneFiles = files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );

  if (sceneFiles.length === 0) {
    return (
      <>
        <style>{STYLES}</style>
        <EmptyBlock />
      </>
    );
  }

  const allContent = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const fallbackColorMap = new Map<string, string>();
  const persona = resolvePersona(files, baseUrl, nameMap);

  const parsed = allContent
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0) {
    return (
      <>
        <style>{STYLES}</style>
        <EmptyBlock />
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="cr-root">
        {groups.map((g, i) => {
          const groupKey = `g-${i}`;
          switch (g.type) {
            case "user":
              return (
                <UserBlock
                  key={groupKey}
                  lines={g.lines}
                  baseUrl={baseUrl}
                  nameMap={nameMap}
                  persona={persona}
                  groupKey={groupKey}
                />
              );
            case "character":
              return (
                <CharacterBlock
                  key={groupKey}
                  group={g}
                  baseUrl={baseUrl}
                  nameMap={nameMap}
                  fallbackColorMap={fallbackColorMap}
                  groupKey={groupKey}
                />
              );
            case "narration":
              return (
                <NarrationBlock
                  key={groupKey}
                  lines={g.lines}
                  baseUrl={baseUrl}
                  nameMap={nameMap}
                  groupKey={groupKey}
                />
              );
            case "divider":
              return <DividerBlock key={groupKey} />;
          }
        })}
        <div data-chat-anchor></div>
      </div>
    </>
  );
}
