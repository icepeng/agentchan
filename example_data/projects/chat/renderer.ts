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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveImageUrl(ctx: RenderContext, dir: string, imageKey: string): string {
  return `${ctx.baseUrl}/files/${dir}/${imageKey}`;
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

function formatInline(
  text: string,
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
): string {
  let result = escapeHtml(text);
  result = result
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/"(.+?)"/g, "\u201c$1\u201d")
    .replace(/\*(.+?)\*/g, '<em class="cr-action">$1</em>');
  result = result.replace(INLINE_IMAGE, (_m, name, key) => {
    const entry = nameMap.get(name);
    const dir = entry?.dir ?? name;
    const url = resolveImageUrl(ctx, dir, key);
    return `<div class="cr-illustration"><img class="cr-illustration-img" src="${url}" alt="${key}" onerror="this.parentElement.style.display='none'" /></div>`;
  });
  return result;
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

  const charFallback = rest.match(/^([^\s:][^:]{0,40}):\s*(["*\u201c].*)$/);
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
      line.type !== "divider" &&
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
  avatarHtml: string;
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
    const avatarHtml = `<img class="cr-avatar-img" src="${src}" alt="${escapeHtml(displayName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="cr-avatar" style="display:none">${initial}</div>`;
    return { color, avatarHtml };
  }

  return {
    color,
    avatarHtml: `<div class="cr-avatar">${initial}</div>`,
  };
}

function fallbackColor(name: string, map: Map<string, string>): string {
  if (map.has(name)) return map.get(name)!;
  const c = CHARACTER_COLORS[map.size % CHARACTER_COLORS.length];
  map.set(name, c);
  return c;
}

// ── Render blocks ────────────────────────────

function renderCharacter(
  group: ChatGroup,
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): string {
  const name = group.characterName!;
  const info = resolveCharacterInfo(group.charDir, group.imageKey, name, ctx, nameMap, fallbackColorMap);
  const content = group.lines.map((l) => formatInline(l, ctx, nameMap)).join("<br/>");

  return `
    <div class="cr-char" style="--c: ${info.color}">
      <div class="cr-halo"></div>
      <div class="cr-char-body">
        ${info.avatarHtml}
        <div class="cr-char-content">
          <div class="cr-name">${escapeHtml(name)}</div>
          <div class="cr-bubble">${content}</div>
        </div>
      </div>
    </div>`;
}

function renderUser(lines: string[], ctx: RenderContext, nameMap: Map<string, NameMapEntry>): string {
  const content = lines.map((l) => formatInline(l, ctx, nameMap)).join("<br/>");
  return `
    <div class="cr-user">
      <div class="cr-user-bubble">${content}</div>
    </div>`;
}

function renderNarration(lines: string[], ctx: RenderContext, nameMap: Map<string, NameMapEntry>): string {
  const content = lines.map((l) => formatInline(l, ctx, nameMap)).join("<br/>");
  return `
    <div class="cr-narr">
      <div class="cr-narr-text">${content}</div>
    </div>`;
}

function renderDivider(): string {
  return `
    <div class="cr-div">
      <span class="cr-dot"></span>
      <span class="cr-dot"></span>
      <span class="cr-dot"></span>
    </div>`;
}

function renderEmpty(): string {
  return `
    <div class="cr-empty">
      <div class="cr-empty-rule"></div>
      <div class="cr-empty-text">무대가 기다리고 있습니다</div>
      <div class="cr-empty-rule"></div>
    </div>`;
}

// ── Styles ───────────────────────────────────

const STYLES = `<style>
  .cr-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0; margin-bottom: 16px; }
  .cr-action-btn { padding: 8px 16px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--color-accent) 15%, transparent); background: color-mix(in srgb, var(--color-accent) 4%, transparent); color: var(--color-accent); font-family: var(--font-family-body); font-size: 13px; cursor: pointer; transition: all 0.15s ease; }
  .cr-action-btn:hover { background: color-mix(in srgb, var(--color-accent) 10%, transparent); border-color: color-mix(in srgb, var(--color-accent) 30%, transparent); }
  .cr-action-btn:active { transform: scale(0.97); }
  .cr-char { position: relative; margin-bottom: 24px; padding: 2px 0; }
  .cr-halo { position: absolute; left: -40px; top: 50%; transform: translateY(-50%); width: 220px; height: 120px; border-radius: 50%; background: radial-gradient(ellipse, var(--c) 0%, transparent 70%); opacity: 0.025; pointer-events: none; transition: opacity 0.5s ease; z-index: 0; }
  .cr-char:hover .cr-halo { opacity: 0.06; }
  .cr-char-body { display: flex; align-items: flex-start; gap: 14px; position: relative; z-index: 1; }
  .cr-avatar-img { flex-shrink: 0; width: 48px; height: 48px; border-radius: 14px; object-fit: cover; box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 12%, transparent), 0 0 12px color-mix(in srgb, var(--c) 6%, transparent); transition: box-shadow 0.3s ease; margin-top: 2px; }
  .cr-char:hover .cr-avatar-img { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 25%, transparent), 0 0 24px color-mix(in srgb, var(--c) 12%, transparent); }
  .cr-avatar { flex-shrink: 0; width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; background: color-mix(in srgb, var(--c) 10%, transparent); color: var(--c); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 12%, transparent), 0 0 12px color-mix(in srgb, var(--c) 6%, transparent); transition: box-shadow 0.3s ease; margin-top: 2px; }
  .cr-char:hover .cr-avatar { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 25%, transparent), 0 0 24px color-mix(in srgb, var(--c) 12%, transparent); }
  .cr-char-content { max-width: 78%; min-width: 0; }
  .cr-name { font-family: var(--font-family-display); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--c); opacity: 0.55; margin-bottom: 6px; transition: opacity 0.2s ease; }
  .cr-char:hover .cr-name { opacity: 0.8; }
  .cr-bubble { padding: 12px 16px; border-radius: 2px 16px 16px 16px; background: color-mix(in srgb, var(--c) 3%, transparent); border-left: 2px solid color-mix(in srgb, var(--c) 12%, transparent); font-size: 14px; line-height: 1.75; color: var(--color-fg); transition: background 0.3s ease, border-left-color 0.3s ease; }
  .cr-char:hover .cr-bubble { background: color-mix(in srgb, var(--c) 5%, transparent); border-left-color: color-mix(in srgb, var(--c) 22%, transparent); }
  .cr-user { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .cr-user-bubble { max-width: 72%; padding: 10px 16px; border-radius: 16px 16px 4px 16px; border: 1px solid color-mix(in srgb, var(--color-accent) 10%, transparent); background: color-mix(in srgb, var(--color-accent) 3%, transparent); font-size: 14px; line-height: 1.65; color: color-mix(in srgb, var(--color-accent) 80%, transparent); transition: border-color 0.2s ease, background 0.2s ease; }
  .cr-user:hover .cr-user-bubble { border-color: color-mix(in srgb, var(--color-accent) 22%, transparent); background: color-mix(in srgb, var(--color-accent) 6%, transparent); }
  .cr-narr { margin: 20px 0; padding: 10px 20px 10px 16px; border-left: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent); }
  .cr-narr-text { font-size: 13.5px; font-style: italic; color: var(--color-fg-2); line-height: 1.8; }
  .cr-div { display: flex; align-items: center; justify-content: center; margin: 44px 0; gap: 7px; color: var(--color-fg-4); }
  .cr-dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }
  .cr-dot:nth-child(2) { opacity: 0.35; }
  .cr-illustration { margin: 12px 0; text-align: center; }
  .cr-illustration-img { max-width: 100%; max-height: 360px; border-radius: 12px; object-fit: contain; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08); }
  .cr-root { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; min-height: 100%; justify-content: flex-end; padding-bottom: 16px; }
  .cr-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 14px; opacity: 0.3; }
  .cr-empty-rule { width: 28px; height: 1px; background: var(--color-fg-4); }
  .cr-empty-text { font-family: var(--font-family-display); font-size: 12px; color: var(--color-fg-3); letter-spacing: 0.08em; }
</style>`;

// ── Main renderer ────────────────────────────

export function render(ctx: RenderContext): string {
  const nameMap = buildNameMap(ctx);

  // Scene files = text files in scenes/ directory
  const sceneFiles = ctx.files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );
  if (sceneFiles.length === 0) return STYLES + renderEmpty();

  const allContent = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const parsed = allContent
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0) return STYLES + renderEmpty();

  const fallbackColorMap = new Map<string, string>();

  const rendered = groups
    .map((g) => {
      switch (g.type) {
        case "user":
          return renderUser(g.lines, ctx, nameMap);
        case "character":
          return renderCharacter(g, ctx, nameMap, fallbackColorMap);
        case "narration":
          return renderNarration(g.lines, ctx, nameMap);
        case "divider":
          return renderDivider();
      }
    })
    .join("\n");

  return `${STYLES}
    <div class="cr-root">
      ${rendered}
      <div class="cr-actions">
        <button class="cr-action-btn" data-action="send">계속</button>
        <button class="cr-action-btn" data-action="fill" data-text="> ">직접 쓰기...</button>
      </div>
      <div data-chat-anchor></div>
    </div>`;
}
