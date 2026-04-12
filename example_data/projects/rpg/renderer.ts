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

// ── RPG Parsing ─────────────────────────────

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

// ── Chat Line Parsing ───────────────────────

const IMAGE_TOKEN = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*/;

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };

  // [SYSTEM] inline message
  const systemMatch = trimmed.match(/^\[SYSTEM\]\s+(.+)$/);
  if (systemMatch) return { type: "system", text: systemMatch[1] };

  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };

  // Strip [name:image-key] token if present
  let rest = trimmed;
  let charDir: string | undefined;
  let imageKey: string | undefined;
  const tokenMatch = trimmed.match(IMAGE_TOKEN);
  if (tokenMatch) {
    charDir = tokenMatch[1]; // Will be resolved via nameMap later
    imageKey = tokenMatch[2];
    rest = trimmed.slice(tokenMatch[0].length);
  }

  // Primary: **Name**: text  OR  **Name:** text (colon inside bold)
  const charMatch = rest.match(/^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/);
  if (charMatch)
    return {
      type: "character",
      characterName: charMatch[1],
      charDir,
      imageKey,
      text: charMatch[2],
    };

  // Fallback: Name: "text" or Name: *text* (without ** markers)
  const charFallback = rest.match(/^([^\s:*][^:]{0,40}):\s*(["*\u201c].*)$/);
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
    // System messages don't merge
    if (line.type === "system") {
      groups.push({ type: "system", lines: [line.text] });
      continue;
    }
    if (
      prev &&
      prev.type === line.type &&
      line.type !== "divider" &&
      line.type !== "system" &&
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

// ── Render: Chat blocks ─────────────────────

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

// ── Render: RPG panels ──────────────────────

function hpColor(pct: number): string {
  if (pct > 0.6) return "#2dd4bf";
  if (pct > 0.3) return "#d97706";
  return "#f87171";
}

function renderBar(label: string, current: number, max: number, color: string): string {
  const pct = Math.max(0, Math.min(1, current / max));
  return `
    <div class="rpg-bar-group">
      <span class="rpg-bar-label" style="color:${color}">${label}</span>
      <div class="rpg-bar">
        <div class="rpg-bar-fill" style="width:${pct * 100}%;background:${color}"></div>
      </div>
      <span class="rpg-bar-value">${current}/${max}</span>
    </div>`;
}

function renderStatusPanel(status: RpgStatus): string {
  const bars: string[] = [];
  if (status.hp) bars.push(renderBar("HP", status.hp.current, status.hp.max, hpColor(Math.max(0, Math.min(1, status.hp.current / status.hp.max)))));
  if (status.mp) bars.push(renderBar("MP", status.mp.current, status.mp.max, "#818cf8"));

  const infoParts: string[] = [];
  if (status.emotion) infoParts.push(`<span class="rpg-emotion">${status.emotion}</span>`);
  if (status.location) infoParts.push(`<span class="rpg-location">${escapeHtml(status.location)}</span>`);
  if (status.effects && status.effects !== "없음") {
    infoParts.push(`<span class="rpg-effect">${escapeHtml(status.effects)}</span>`);
  }

  return `
    <div class="rpg-status-panel">
      ${bars.length > 0 ? `<div class="rpg-bars">${bars.join("")}</div>` : ""}
      ${infoParts.length > 0 ? `<div class="rpg-info">${infoParts.join("")}</div>` : ""}
    </div>`;
}

function renderInventoryPanel(items: InventoryItem[]): string {
  const activeItems = items.filter((i) => i.type !== "-");
  const rows = items
    .map((item) => {
      const cls =
        item.type === "+" ? "rpg-item-add" : item.type === "-" ? "rpg-item-remove" : "rpg-item-keep";
      const prefix =
        item.type === "+"
          ? '<span class="rpg-item-prefix rpg-add">+</span>'
          : item.type === "-"
            ? '<span class="rpg-item-prefix rpg-remove">\u2212</span>'
            : '<span class="rpg-item-prefix rpg-keep">\u00b7</span>';
      const desc = item.description
        ? ` <span class="rpg-item-desc">\u2014 ${escapeHtml(item.description)}</span>`
        : "";
      return `<li class="rpg-item ${cls}">${prefix} ${escapeHtml(item.name)}${desc}</li>`;
    })
    .join("");

  return `
    <details class="rpg-section" open>
      <summary class="rpg-section-header">
        <span class="rpg-section-icon">\uD83C\uDF92</span>
        <span class="rpg-section-title">인벤토리</span>
        <span class="rpg-count">${activeItems.length}</span>
      </summary>
      <ul class="rpg-item-list">${rows}</ul>
    </details>`;
}

function renderQuestPanel(quests: QuestEntry[]): string {
  const rows = quests
    .map((q) => {
      const cls =
        q.type === "~"
          ? "rpg-quest-progress"
          : q.type === "+"
            ? "rpg-quest-new"
            : "rpg-quest-done";
      const icon =
        q.type === "~"
          ? '<span class="rpg-quest-icon rpg-progress">\u25CB</span>'
          : q.type === "+"
            ? '<span class="rpg-quest-icon rpg-new">+</span>'
            : '<span class="rpg-quest-icon rpg-done">\u2713</span>';
      const desc = q.description
        ? ` <span class="rpg-quest-desc">\u2014 ${escapeHtml(q.description)}</span>`
        : "";
      return `<li class="rpg-quest ${cls}">${icon} ${escapeHtml(q.name)}${desc}</li>`;
    })
    .join("");

  const activeCount = quests.filter((q) => q.type !== "\u2713").length;

  return `
    <details class="rpg-section" open>
      <summary class="rpg-section-header">
        <span class="rpg-section-icon">\uD83D\uDCDC</span>
        <span class="rpg-section-title">퀘스트</span>
        <span class="rpg-count">${activeCount}</span>
      </summary>
      <ul class="rpg-quest-list">${rows}</ul>
    </details>`;
}

function renderSystem(text: string): string {
  return `
    <div class="rpg-system">
      <div class="rpg-system-text">${escapeHtml(text)}</div>
    </div>`;
}

function renderEmpty(): string {
  return `
    <div class="cr-empty">
      <div class="cr-empty-rule"></div>
      <div class="cr-empty-text">모험이 기다리고 있습니다</div>
      <div class="cr-empty-rule"></div>
    </div>`;
}

// ── Styles ───────────────────────────────────

const STYLES = `<style>
  /* ── Chat: Character message ── */
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
  .cr-char:hover .cr-halo { opacity: 0.06; }
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
  .cr-char-content { max-width: 78%; min-width: 0; }
  .cr-name {
    font-family: var(--font-family-display);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: color-mix(in srgb, var(--c) 60%, var(--color-fg));
    opacity: 0.8;
    margin-bottom: 6px;
    transition: opacity 0.2s ease;
  }
  .cr-char:hover .cr-name { opacity: 0.8; }
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

  /* ── Chat: User message ── */
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

  /* ── Chat: Narration ── */
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

  /* ── Chat: Divider ── */
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
  .cr-dot:nth-child(2) { opacity: 0.35; }

  /* ── Chat: Inline illustration ── */
  .cr-illustration { margin: 12px 0; text-align: center; }
  .cr-illustration-img {
    max-width: 100%;
    max-height: 360px;
    border-radius: 12px;
    object-fit: contain;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }

  /* ── Chat: Empty state ── */
  .cr-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 14px;
    opacity: 0.3;
  }
  .cr-empty-rule { width: 28px; height: 1px; background: var(--color-fg-4); }
  .cr-empty-text {
    font-family: var(--font-family-display);
    font-size: 12px;
    color: var(--color-fg-3);
    letter-spacing: 0.08em;
  }

  /* ── RPG: Wrapper — 50/50 split layout ── */
  .rpg-wrapper {
    display: flex;
    flex-direction: row;
    min-height: 100%;
  }

  /* ── RPG: Chat pane (left, fills remaining space) ── */
  .cr-root {
    flex: 1;
    min-width: 0;
    max-width: 640px;
    margin-left: auto;
    margin-right: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 0 24px 16px;
    box-sizing: border-box;
  }

  /* ── RPG: Status pane (right, fixed width pinned to edge) ── */
  .rpg-sidebar {
    width: 380px;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    align-self: flex-start;
    max-height: 100vh;
    overflow-y: auto;
    border-left: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent);
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-edge) 8%, transparent) transparent;
  }
  .rpg-sidebar::-webkit-scrollbar { width: 4px; }
  .rpg-sidebar::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-edge) 12%, transparent);
    border-radius: 2px;
  }

  /* ── RPG: Status panel ── */
  .rpg-status-panel {
    padding: 20px 24px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 5%, transparent);
  }
  .rpg-bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }
  .rpg-bar-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rpg-bar-label {
    font-family: var(--font-family-display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    width: 24px;
    flex-shrink: 0;
  }
  .rpg-bar {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--color-edge) 8%, transparent);
    overflow: hidden;
  }
  .rpg-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease;
    opacity: 0.85;
  }
  .rpg-bar-value {
    font-size: 11px;
    font-family: var(--font-family-mono, monospace);
    color: var(--color-fg-3);
    width: 56px;
    text-align: right;
    flex-shrink: 0;
  }
  .rpg-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .rpg-emotion { font-size: 18px; line-height: 1; }
  .rpg-location {
    font-size: 12px;
    color: var(--color-fg-3);
    letter-spacing: 0.02em;
    line-height: 1.4;
  }
  .rpg-location::before {
    content: "\uD83D\uDCCD";
    margin-right: 4px;
    font-size: 11px;
  }
  .rpg-effect {
    font-size: 11px;
    color: var(--color-warm);
    background: color-mix(in srgb, var(--color-warm) 8%, transparent);
    padding: 2px 10px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--color-warm) 15%, transparent);
  }

  /* ── RPG: Section (inventory / quest) ── */
  .rpg-section {
    border-bottom: 1px solid color-mix(in srgb, var(--color-edge) 5%, transparent);
  }
  .rpg-section-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 12px 24px;
    cursor: pointer;
    font-size: 12px;
    color: var(--color-fg-3);
    user-select: none;
    list-style: none;
    transition: color 0.2s ease;
  }
  .rpg-section-header::-webkit-details-marker { display: none; }
  .rpg-section-header:hover { color: var(--color-fg-2); }
  .rpg-section-icon { font-size: 14px; }
  .rpg-section-title {
    font-family: var(--font-family-display);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 10px;
  }
  .rpg-count {
    margin-left: auto;
    font-size: 11px;
    font-family: var(--font-family-mono, monospace);
    color: var(--color-fg-4);
  }
  .rpg-count::before { content: "("; }
  .rpg-count::after { content: ")"; }

  /* ── RPG: Inventory ── */
  .rpg-item-list {
    list-style: none;
    margin: 0;
    padding: 0 24px 14px;
  }
  .rpg-item {
    font-size: 13px;
    line-height: 1.8;
    color: var(--color-fg-2);
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .rpg-item-prefix {
    font-weight: 700;
    font-family: var(--font-family-mono, monospace);
    font-size: 12px;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }
  .rpg-add { color: #34d399; }
  .rpg-remove { color: #f87171; }
  .rpg-keep { color: var(--color-fg-4); }
  .rpg-item-remove { opacity: 0.5; text-decoration: line-through; }
  .rpg-item-desc {
    color: var(--color-fg-4);
    font-size: 12px;
  }

  /* ── RPG: Quests ── */
  .rpg-quest-list {
    list-style: none;
    margin: 0;
    padding: 0 24px 14px;
  }
  .rpg-quest {
    font-size: 13px;
    line-height: 1.8;
    color: var(--color-fg-2);
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .rpg-quest-icon {
    font-weight: 700;
    font-family: var(--font-family-mono, monospace);
    font-size: 11px;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }
  .rpg-progress { color: var(--color-warm); }
  .rpg-new { color: #34d399; }
  .rpg-done { color: #2dd4bf; }
  .rpg-quest-done { opacity: 0.5; }
  .rpg-quest-desc {
    color: var(--color-fg-4);
    font-size: 12px;
  }

  /* ── RPG: System message (inline in chat) ── */
  .rpg-system {
    margin: 16px 0;
    display: flex;
    justify-content: center;
  }
  .rpg-system-text {
    font-size: 11px;
    font-family: var(--font-family-display);
    color: var(--color-warm);
    background: color-mix(in srgb, var(--color-warm) 4%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-warm) 10%, transparent);
    border-radius: 12px;
    padding: 4px 14px;
    letter-spacing: 0.01em;
    line-height: 1.5;
    max-width: 90%;
    text-align: center;
  }
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

  // Extract RPG data
  const status = parseStatusBlock(allContent);
  const inventory = parseInventoryBlock(allContent);
  const quests = parseQuestBlock(allContent);

  // Strip RPG blocks, then parse remaining as chat
  const chatContent = stripRpgBlocks(allContent);
  const parsed = chatContent
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0 && !status) return STYLES + renderEmpty();

  const fallbackColorMap = new Map<string, string>();

  const chatHtml = groups
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
        case "system":
          return renderSystem(g.lines[0]);
      }
    })
    .join("\n");

  // Build RPG sidebar
  const sidebarParts: string[] = [];
  if (status) sidebarParts.push(renderStatusPanel(status));
  if (inventory.length > 0) sidebarParts.push(renderInventoryPanel(inventory));
  if (quests.length > 0) sidebarParts.push(renderQuestPanel(quests));

  const hasSidebar = sidebarParts.length > 0;

  return `${STYLES}
    <div class="rpg-wrapper">
      <div class="cr-root">
        ${chatHtml}
        <div data-chat-anchor></div>
      </div>
      ${hasSidebar ? `<div class="rpg-sidebar">${sidebarParts.join("")}</div>` : ""}
    </div>`;
}
