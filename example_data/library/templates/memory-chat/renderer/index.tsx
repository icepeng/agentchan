/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
import "./index.css";
import type { ReactElement } from "react";

type ProjectFile = Agentchan.ProjectFile;
type TextFile = Agentchan.TextFile;
type DataFile = Agentchan.DataFile;
type BinaryFile = Agentchan.BinaryFile;
type AgentState = Agentchan.RendererAgentState;
type RendererActions = Agentchan.RendererActions;

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
const BOLD_OR_ITALIC = /\*\*(.+?)\*\*|\*(.+?)\*/g;

function formatInline(
  text: string,
  baseUrl: string,
  nameMap: Map<string, NameMapEntry>,
  keyPrefix: string,
): (string | ReactElement)[] {
  const nodes: (string | ReactElement)[] = [];
  let cursor = 0;
  let idx = 0;

  // Smart quotes: replace "x" → “x”
  const quoted = text.replace(/"(.+?)"/g, "“$1”");

  // Find image tokens and emit segments around them; within each segment apply bold/italic.
  INLINE_IMAGE.lastIndex = 0;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = INLINE_IMAGE.exec(quoted)) !== null) {
    if (imgMatch.index > cursor) {
      pushFormatted(nodes, quoted.slice(cursor, imgMatch.index), `${keyPrefix}-t-${idx++}`);
    }
    const name = imgMatch[1];
    const key = imgMatch[2];
    const entry = nameMap.get(name);
    const dir = entry?.dir ?? name;
    const url = resolveImageUrl(baseUrl, dir, key);
    nodes.push(
      <span key={`${keyPrefix}-img-${idx++}`} className="cr-illustration">
        <img
          className="cr-illustration-img"
          src={url}
          alt={key}
          onError={(e) => {
            const parent = (e.currentTarget as HTMLImageElement).parentElement;
            if (parent) parent.style.display = "none";
          }}
        />
      </span>,
    );
    cursor = imgMatch.index + imgMatch[0].length;
  }
  if (cursor < quoted.length) {
    pushFormatted(nodes, quoted.slice(cursor), `${keyPrefix}-t-${idx++}`);
  }

  return nodes;
}

function pushFormatted(
  nodes: (string | ReactElement)[],
  text: string,
  keyPrefix: string,
): void {
  if (!text) return;
  let cursor = 0;
  let idx = 0;
  BOLD_OR_ITALIC.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOLD_OR_ITALIC.exec(text)) !== null) {
    if (m.index > cursor) nodes.push(text.slice(cursor, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${idx++}`}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      nodes.push(
        <em key={`${keyPrefix}-i-${idx++}`} className="cr-action">
          {m[2]}
        </em>,
      );
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
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

interface PersonaInfo {
  displayName: string;
  color: string;
  dir?: string;
  imageKey?: string;
}

function fallbackColor(name: string, map: Map<string, string>): string {
  if (map.has(name)) return map.get(name)!;
  const c = CHARACTER_COLORS[map.size % CHARACTER_COLORS.length];
  map.set(name, c);
  return c;
}

function resolvePersona(
  files: ProjectFile[],
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
  const entry = nameMap.get(displayName);
  const isolatedColorMap = new Map<string, string>();
  const fallback = entry?.color || fallbackColor(displayName, isolatedColorMap);
  const color = fm.color ? String(fm.color) : fallback;

  return { displayName, color, dir, imageKey };
}

// ── Avatar component ─────────────────────────

interface AvatarProps {
  displayName: string;
  charDir?: string;
  imageKey?: string;
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
}

function Avatar({ displayName, charDir, imageKey, baseUrl, nameMap }: AvatarProps): ReactElement {
  const entry = nameMap.get(displayName);
  const resolvedDir = charDir ?? entry?.dir;
  const initial = displayName.charAt(0).toUpperCase();

  if (resolvedDir && imageKey) {
    const src = resolveImageUrl(baseUrl, resolvedDir, imageKey);
    return (
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
  }

  return <div className="cr-avatar">{initial}</div>;
}

// ── Render blocks ────────────────────────────

interface CharacterBlockProps {
  group: ChatGroup;
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  fallbackColorMap: Map<string, string>;
  keyPrefix: string;
}

function CharacterBlock({
  group,
  baseUrl,
  nameMap,
  fallbackColorMap,
  keyPrefix,
}: CharacterBlockProps): ReactElement {
  const name = group.characterName!;
  const entry = nameMap.get(name);
  const color = entry?.color || fallbackColor(name, fallbackColorMap);

  return (
    <div className="cr-char" style={{ ["--c" as string]: color }}>
      <div className="cr-halo" />
      <div className="cr-char-body">
        <Avatar
          displayName={name}
          charDir={group.charDir}
          imageKey={group.imageKey}
          baseUrl={baseUrl}
          nameMap={nameMap}
        />
        <div className="cr-char-content">
          <div className="cr-name">{name}</div>
          <div className="cr-bubble">
            {group.lines.map((l, i) => (
              <span key={i}>
                {formatInline(l, baseUrl, nameMap, `${keyPrefix}-l${i}`)}
                {i < group.lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface UserBlockProps {
  lines: string[];
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  persona: PersonaInfo | null;
  keyPrefix: string;
}

function UserBlock({ lines, baseUrl, nameMap, persona, keyPrefix }: UserBlockProps): ReactElement {
  const content = (
    <div className="cr-bubble">
      {lines.map((l, i) => (
        <span key={i}>
          {formatInline(l, baseUrl, nameMap, `${keyPrefix}-l${i}`)}
          {i < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </div>
  );

  if (persona) {
    return (
      <div className="cr-char" style={{ ["--c" as string]: persona.color }}>
        <div className="cr-halo" />
        <div className="cr-char-body">
          <Avatar
            displayName={persona.displayName}
            charDir={persona.dir}
            imageKey={persona.imageKey}
            baseUrl={baseUrl}
            nameMap={nameMap}
          />
          <div className="cr-char-content">
            <div className="cr-name">{persona.displayName}</div>
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-char cr-char--anon" style={{ ["--c" as string]: "var(--color-accent)" }}>
      <div className="cr-char-body">
        <div className="cr-char-content">{content}</div>
      </div>
    </div>
  );
}

interface NarrationBlockProps {
  lines: string[];
  baseUrl: string;
  nameMap: Map<string, NameMapEntry>;
  keyPrefix: string;
}

function NarrationBlock({ lines, baseUrl, nameMap, keyPrefix }: NarrationBlockProps): ReactElement {
  return (
    <div className="cr-narr">
      <div className="cr-narr-text">
        {lines.map((l, i) => (
          <span key={i}>
            {formatInline(l, baseUrl, nameMap, `${keyPrefix}-l${i}`)}
            {i < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function DividerBlock(): ReactElement {
  return (
    <div className="cr-div">
      <span className="cr-dot" />
      <span className="cr-dot" />
      <span className="cr-dot" />
    </div>
  );
}

function EmptyBlock(): ReactElement {
  return (
    <div className="cr-empty">
      <div className="cr-empty-rule" />
      <div className="cr-empty-text">무대가 기다리고 있습니다</div>
      <div className="cr-empty-rule" />
    </div>
  );
}

// ── Styles ───────────────────────────────────


// ── Main renderer ────────────────────────────

function RendererContent({ files, baseUrl }: RendererContentProps): ReactElement {
  const nameMap = buildNameMap(files);

  const sceneFiles = files
    .filter((f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (sceneFiles.length === 0) {
    return (
      <div className="cr-root">
        <EmptyBlock />
      </div>
    );
  }

  const allContent = sceneFiles.map((f) => f.content).join("\n\n---\n\n");

  const fallbackColorMap = new Map<string, string>();
  const persona = resolvePersona(files, nameMap);

  const parsed = allContent
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0) {
    return (
      <div className="cr-root">
        <EmptyBlock />
      </div>
    );
  }

  return (
    <div className="cr-root">
      {groups.map((g, i) => {
        const keyPrefix = `g${i}`;
        switch (g.type) {
          case "user":
            return (
              <UserBlock
                key={keyPrefix}
                lines={g.lines}
                baseUrl={baseUrl}
                nameMap={nameMap}
                persona={persona}
                keyPrefix={keyPrefix}
              />
            );
          case "character":
            return (
              <CharacterBlock
                key={keyPrefix}
                group={g}
                baseUrl={baseUrl}
                nameMap={nameMap}
                fallbackColorMap={fallbackColorMap}
                keyPrefix={keyPrefix}
              />
            );
          case "narration":
            return (
              <NarrationBlock
                key={keyPrefix}
                lines={g.lines}
                baseUrl={baseUrl}
                nameMap={nameMap}
                keyPrefix={keyPrefix}
              />
            );
          case "divider":
            return <DividerBlock key={keyPrefix} />;
        }
      })}
      <div data-chat-anchor />
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
