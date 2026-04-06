interface RenderContext {
  outputFiles: { path: string; content: string; modifiedAt: number }[];
  skills: { name: string; description: string; metadata?: Record<string, string> }[];
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

function resolveImageUrl(ctx: RenderContext, skillName: string, imageKey: string): string {
  return `${ctx.baseUrl}/files/skills/${skillName}/${imageKey}`;
}

const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;

function formatInline(text: string, ctx: RenderContext): string {
  let result = escapeHtml(text);
  // Text formatting first (before image replacement to avoid smart-quotes breaking HTML attributes)
  result = result
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/"(.+?)"/g, "\u201c$1\u201d")
    .replace(/\*(.+?)\*/g, '<em class="cr-action">$1</em>');
  // Inline image tokens → illustration blocks (after text formatting so quotes stay intact)
  result = result.replace(INLINE_IMAGE, (_m, skill, key) => {
    const url = resolveImageUrl(ctx, skill, key);
    return `<div class="cr-illustration"><img class="cr-illustration-img" src="${url}" alt="${key}" onerror="this.parentElement.style.display='none'" /></div>`;
  });
  return result;
}

// ── Types ────────────────────────────────────

interface ChatLine {
  type: "user" | "character" | "narration" | "divider";
  characterName?: string;
  skillName?: string;
  imageKey?: string;
  text: string;
}

interface ChatGroup {
  type: "user" | "character" | "narration" | "divider";
  characterName?: string;
  skillName?: string;
  imageKey?: string;
  lines: string[];
}

// ── Name-based avatar resolution ────────────

interface NameMapEntry {
  skillName: string;
  avatarImage: string;
}

function buildNameMap(ctx: RenderContext): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const skill of ctx.skills) {
    const m = skill.metadata;
    if (!m || m.type !== "character" || !m["avatar-image"]) continue;
    const entry: NameMapEntry = { skillName: skill.name, avatarImage: m["avatar-image"] };
    // names takes priority; display-name is a fallback for skills that omit names
    if (m.names) {
      for (const raw of m.names.split(",")) {
        const name = raw.trim();
        if (name && !map.has(name)) map.set(name, entry);
      }
    }
    const dn = m["display-name"];
    if (dn && !map.has(dn)) map.set(dn, entry);
  }
  return map;
}

function resolveAvatar(line: ChatLine, nameMap: Map<string, NameMapEntry>): ChatLine {
  if (line.type !== "character" || line.skillName) return line;
  const entry = nameMap.get(line.characterName!);
  if (!entry) return line;
  return { ...line, skillName: entry.skillName, imageKey: entry.avatarImage };
}

// ── Parsing ──────────────────────────────────

const IMAGE_TOKEN = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*/;

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };

  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };

  // Strip [skill-name:image-key] token if present
  let rest = trimmed;
  let skillName: string | undefined;
  let imageKey: string | undefined;
  const tokenMatch = trimmed.match(IMAGE_TOKEN);
  if (tokenMatch) {
    skillName = tokenMatch[1];
    imageKey = tokenMatch[2];
    rest = trimmed.slice(tokenMatch[0].length);
  }

  // Primary: **Name**: text  OR  **Name:** text (colon inside bold)
  const charMatch = rest.match(/^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/);
  if (charMatch)
    return {
      type: "character",
      characterName: charMatch[1],
      skillName,
      imageKey,
      text: charMatch[2],
    };

  // Fallback: Name: "text" or Name: *text* (without ** markers)
  const charFallback = rest.match(/^([^\s:*][^:]{0,40}):\s*(["*\u201c].*)$/);
  if (charFallback)
    return {
      type: "character",
      characterName: charFallback[1],
      skillName,
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
        skillName: line.skillName,
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
  skillName: string | undefined,
  imageKey: string | undefined,
  displayName: string,
  ctx: RenderContext,
  fallbackColorMap: Map<string, string>,
): CharacterInfo {
  const skill = skillName
    ? ctx.skills.find((s) => s.name === skillName)
    : undefined;
  const m = skill?.metadata;
  const color = m?.color || fallbackColor(displayName, fallbackColorMap);
  const initial = displayName.charAt(0).toUpperCase();

  if (skillName && imageKey) {
    const src = resolveImageUrl(ctx, skillName, imageKey);
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
  fallbackColorMap: Map<string, string>,
): string {
  const name = group.characterName!;
  const info = resolveCharacterInfo(group.skillName, group.imageKey, name, ctx, fallbackColorMap);
  const content = group.lines.map((l) => formatInline(l, ctx)).join("<br/>");

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

function renderUser(lines: string[], ctx: RenderContext): string {
  const content = lines.map((l) => formatInline(l, ctx)).join("<br/>");
  return `
    <div class="cr-user">
      <div class="cr-user-bubble">${content}</div>
    </div>`;
}

function renderNarration(lines: string[], ctx: RenderContext): string {
  const content = lines.map((l) => formatInline(l, ctx)).join("<br/>");
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
  /* ── Inline formatting ── */
  .cr-action {
  }

  /* ── Character message ── */
  .cr-char {
    position: relative;
    margin-bottom: 24px;
    padding: 2px 0;
  }
  .cr-halo {
    position: absolute;
    left: -40px;
    top: 50%;
    transform: translateY(-50%);
    width: 220px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(ellipse, var(--c) 0%, transparent 70%);
    opacity: 0.025;
    pointer-events: none;
    transition: opacity 0.5s ease;
    z-index: 0;
  }
  .cr-char:hover .cr-halo {
    opacity: 0.06;
  }
  .cr-char-body {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    position: relative;
    z-index: 1;
  }
  .cr-avatar-img {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    object-fit: cover;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c) 12%, transparent),
      0 0 12px color-mix(in srgb, var(--c) 6%, transparent);
    transition: box-shadow 0.3s ease;
    margin-top: 2px;
  }
  .cr-char:hover .cr-avatar-img {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c) 25%, transparent),
      0 0 24px color-mix(in srgb, var(--c) 12%, transparent);
  }
  .cr-avatar {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
    background: color-mix(in srgb, var(--c) 10%, transparent);
    color: var(--c);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c) 12%, transparent),
      0 0 12px color-mix(in srgb, var(--c) 6%, transparent);
    transition: box-shadow 0.3s ease;
    margin-top: 2px;
  }
  .cr-char:hover .cr-avatar {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c) 25%, transparent),
      0 0 24px color-mix(in srgb, var(--c) 12%, transparent);
  }
  .cr-char-content {
    max-width: 78%;
    min-width: 0;
  }
  .cr-name {
    font-family: var(--font-family-display);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--c);
    opacity: 0.55;
    margin-bottom: 6px;
    transition: opacity 0.2s ease;
  }
  .cr-char:hover .cr-name {
    opacity: 0.8;
  }
  .cr-bubble {
    padding: 12px 16px;
    border-radius: 2px 16px 16px 16px;
    background: color-mix(in srgb, var(--c) 3%, transparent);
    border-left: 2px solid color-mix(in srgb, var(--c) 12%, transparent);
    font-size: 14px;
    line-height: 1.75;
    color: var(--color-fg);
    transition: background 0.3s ease, border-left-color 0.3s ease;
  }
  .cr-char:hover .cr-bubble {
    background: color-mix(in srgb, var(--c) 5%, transparent);
    border-left-color: color-mix(in srgb, var(--c) 22%, transparent);
  }

  /* ── User message ── */
  .cr-user {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 24px;
  }
  .cr-user-bubble {
    max-width: 72%;
    padding: 10px 16px;
    border-radius: 16px 16px 4px 16px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 10%, transparent);
    background: color-mix(in srgb, var(--color-accent) 3%, transparent);
    font-size: 14px;
    line-height: 1.65;
    color: color-mix(in srgb, var(--color-accent) 80%, transparent);
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .cr-user:hover .cr-user-bubble {
    border-color: color-mix(in srgb, var(--color-accent) 22%, transparent);
    background: color-mix(in srgb, var(--color-accent) 6%, transparent);
  }

  /* ── Narration ── */
  .cr-narr {
    margin: 20px 0;
    padding: 10px 20px 10px 16px;
    border-left: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent);
  }
  .cr-narr-text {
    font-size: 13.5px;
    font-style: italic;
    color: var(--color-fg-2);
    line-height: 1.8;
  }

  /* ── Scene divider ── */
  .cr-div {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 44px 0;
    gap: 7px;
    color: var(--color-fg-4);
  }
  .cr-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
  }
  .cr-dot:nth-child(2) {
    opacity: 0.35;
  }

  /* ── Inline illustration ── */
  .cr-illustration {
    margin: 12px 0;
    text-align: center;
  }
  .cr-illustration-img {
    max-width: 100%;
    max-height: 360px;
    border-radius: 12px;
    object-fit: contain;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }

  /* ── Root container ── */
  .cr-root {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 100%;
    justify-content: flex-end;
    padding-bottom: 16px;
  }

  /* ── Empty state ── */
  .cr-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 14px;
    opacity: 0.3;
  }
  .cr-empty-rule {
    width: 28px;
    height: 1px;
    background: var(--color-fg-4);
  }
  .cr-empty-text {
    font-family: var(--font-family-display);
    font-size: 12px;
    color: var(--color-fg-3);
    letter-spacing: 0.08em;
  }
</style>`;

// ── Main renderer ────────────────────────────

export function render(ctx: RenderContext): string {
  const files = ctx.outputFiles;
  if (files.length === 0) return STYLES + renderEmpty();

  const allContent = files
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const nameMap = buildNameMap(ctx);
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
          return renderUser(g.lines, ctx);
        case "character":
          return renderCharacter(g, ctx, fallbackColorMap);
        case "narration":
          return renderNarration(g.lines, ctx);
        case "divider":
          return renderDivider();
      }
    })
    .join("\n");

  return `${STYLES}
    <div class="cr-root">
      ${rendered}
      <div data-chat-anchor></div>
    </div>`;
}
