// ─────────────────────────────────────────────────────────────────────────────
//   interactive-chat renderer  ·  branching chat with choice buttons
//
//   iframe 격리된 렌더러 — mount(container, ctx)로 부팅하고 subscribeFiles로
//   변화를 받아 Idiomorph로 morph한다. 선택지 버튼은 data-action="send"로
//   컨테이너 click 위임 처리.
// ─────────────────────────────────────────────────────────────────────────────

import { Idiomorph } from "./lib/idiomorph.js";

// --- Contract (inline — renderer는 독립 transpile이라 타입 import 불가) -----

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

interface AgentState {
  messages: ReadonlyArray<unknown>;
  streamingMessage?: unknown;
  pendingToolCalls: ReadonlySet<string>;
  isStreaming: boolean;
}

interface RendererAction {
  type: "send" | "fill";
  text: string;
}

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

interface RendererHostApi {
  sendAction(action: RendererAction): void;
  setTheme(theme: RendererTheme | null): void;
  subscribeState(cb: (state: AgentState) => void): () => void;
  subscribeFiles(cb: (files: ProjectFile[]) => void): () => void;
  readonly version: 1;
}

interface MountContext {
  files: ProjectFile[];
  baseUrl: string;
  assetsUrl: string;
  state: AgentState;
  host: RendererHostApi;
}

interface RendererHandle {
  destroy(): void;
}

// 내부 pure 렌더링 단위. mount가 MountContext에서 뽑아 넘긴다.
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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

interface PersonaInfo {
  displayName: string;
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
  const info = resolveCharacterInfo(dir, imageKey, displayName, ctx, nameMap, isolatedColorMap);
  const color = fm.color ? String(fm.color) : info.color;

  return { displayName, color, avatarHtml: info.avatarHtml };
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

function renderUser(
  lines: string[],
  ctx: RenderContext,
  nameMap: Map<string, NameMapEntry>,
  persona: PersonaInfo | null,
): string {
  const content = lines.map((l) => formatInline(l, ctx, nameMap)).join("<br/>");

  if (persona) {
    return `
    <div class="cr-char" style="--c: ${persona.color}">
      <div class="cr-halo"></div>
      <div class="cr-char-body">
        ${persona.avatarHtml}
        <div class="cr-char-content">
          <div class="cr-name">${escapeHtml(persona.displayName)}</div>
          <div class="cr-bubble">${content}</div>
        </div>
      </div>
    </div>`;
  }

  return `
    <div class="cr-char cr-char--anon" style="--c: var(--color-accent)">
      <div class="cr-char-body">
        <div class="cr-char-content">
          <div class="cr-bubble">${content}</div>
        </div>
      </div>
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

function renderChoices(choices: string[]): string {
  if (choices.length === 0) return "";
  const buttons = choices
    .map((c) => `<button class="cr-choice-btn" data-action="send" data-text="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
    .join("\n        ");
  return `
      <div class="cr-choices">
        ${buttons}
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
  .cr-choices { display: flex; flex-direction: column; gap: 8px; padding: 8px 0 4px; margin-bottom: 8px; }
  .cr-choice-btn { width: 100%; padding: 10px 16px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--color-accent) 12%, transparent); background: color-mix(in srgb, var(--color-accent) 3%, transparent); color: var(--color-accent); font-family: var(--font-family-body); font-size: 13.5px; line-height: 1.5; text-align: left; cursor: pointer; transition: all 0.15s ease; }
  .cr-choice-btn:hover { background: color-mix(in srgb, var(--color-accent) 8%, transparent); border-color: color-mix(in srgb, var(--color-accent) 25%, transparent); }
  .cr-choice-btn:active { transform: scale(0.98); }
</style>`;

// ── Main renderer ────────────────────────────

function renderScene(ctx: RenderContext): string {
  const nameMap = buildNameMap(ctx);

  const sceneFiles = ctx.files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );
  if (sceneFiles.length === 0) return STYLES + renderEmpty();

  const allContent = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const { cleaned, choices } = extractChoices(allContent);

  const fallbackColorMap = new Map<string, string>();
  const persona = resolvePersona(ctx, nameMap);

  const parsed = cleaned
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0) return STYLES + renderEmpty();

  const rendered = groups
    .map((g) => {
      switch (g.type) {
        case "user":
          return renderUser(g.lines, ctx, nameMap, persona);
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
      ${renderChoices(choices)}
      <div data-chat-anchor></div>
    </div>`;
}

// ── Mount ───────────────────────────────────────────────────────────────────

export function mount(container: HTMLElement, ctx: MountContext): RendererHandle {
  let files = ctx.files;
  let scheduled = false;
  let lastHtml = "";

  const doc = container.ownerDocument;
  const scrollEl = doc.scrollingElement ?? doc.documentElement;

  function isNearBottom(): boolean {
    const slack = 64;
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= slack;
  }

  function scrollToBottom(behavior: ScrollBehavior) {
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const html = renderScene({ files, baseUrl: ctx.baseUrl });
      if (html === lastHtml) return;
      const wasAtBottom = isNearBottom();
      lastHtml = html;
      Idiomorph.morph(container, html, { morphStyle: "innerHTML", ignoreActiveValue: true });
      if (wasAtBottom) scrollToBottom("smooth");
    });
  }

  // 초기 렌더: 이전 DOM이 없으므로 innerHTML로 paint 후 바닥 고정.
  lastHtml = renderScene({ files, baseUrl: ctx.baseUrl });
  container.innerHTML = lastHtml;
  scrollToBottom("auto");

  const unsubFiles = ctx.host.subscribeFiles((next) => {
    files = next;
    schedule();
  });

  const onClick = (ev: MouseEvent) => {
    const target = ev.target as Element | null;
    if (!target) return;
    const el = target.closest<HTMLElement>("[data-action]");
    if (!el) return;
    const type = el.dataset.action;
    if (type !== "send" && type !== "fill") return;
    const text = (el.dataset.text ?? el.textContent ?? "").trim();
    if (!text) return;
    ev.preventDefault();
    ctx.host.sendAction({ type, text });
  };
  container.addEventListener("click", onClick);

  return {
    destroy() {
      unsubFiles();
      container.removeEventListener("click", onClick);
      container.innerHTML = "";
    },
  };
}
