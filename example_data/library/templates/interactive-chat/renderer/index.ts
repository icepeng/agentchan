import type { AgentState, ProjectFile, TextFile } from "@agentchan/types";
import { Idiomorph } from "/api/host/lib/idiomorph.js";

const slug = location.pathname.match(/\/projects\/([^/]+)\//)?.[1] ?? "";
const baseUrl = `/api/projects/${slug}/files`;
const root = document.getElementById("root")!;

let state: AgentState = {
  messages: [],
  pendingToolCalls: [],
  isStreaming: false,
};
let files: ProjectFile[] = [];

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

function resolveImageUrl(dir: string, imageKey: string): string {
  return `${baseUrl}/${dir}/${imageKey}`;
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

function resolveAvatar(line: ChatLine, nameMap: Map<string, NameMapEntry>): ChatLine {
  if (line.type !== "character" || line.charDir) return line;
  const entry = nameMap.get(line.characterName!);
  if (!entry) return line;
  return { ...line, charDir: entry.dir, imageKey: entry.avatarImage };
}

// ── Inline formatting ───────────────────────

const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;

function formatInline(text: string, nameMap: Map<string, NameMapEntry>): string {
  let result = escapeHtml(text);
  result = result
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/"(.+?)"/g, "“$1”")
    .replace(/\*(.+?)\*/g, '<em class="cr-action">$1</em>');
  result = result.replace(INLINE_IMAGE, (_m, name, key) => {
    const entry = nameMap.get(name);
    const dir = entry?.dir ?? name;
    const url = resolveImageUrl(dir, key);
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
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): CharacterInfo {
  const entry = nameMap.get(displayName);
  const color = entry?.color || fallbackColor(displayName, fallbackColorMap);
  const initial = displayName.charAt(0).toUpperCase();

  const resolvedDir = charDir ?? entry?.dir;
  if (resolvedDir && imageKey) {
    const src = resolveImageUrl(resolvedDir, imageKey);
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
  const info = resolveCharacterInfo(dir, imageKey, displayName, nameMap, isolatedColorMap);
  const color = fm.color ? String(fm.color) : info.color;

  return { displayName, color, avatarHtml: info.avatarHtml };
}

// ── Render blocks ────────────────────────────

function renderCharacter(
  group: ChatGroup,
  nameMap: Map<string, NameMapEntry>,
  fallbackColorMap: Map<string, string>,
): string {
  const name = group.characterName!;
  const info = resolveCharacterInfo(group.charDir, group.imageKey, name, nameMap, fallbackColorMap);
  const content = group.lines.map((l) => formatInline(l, nameMap)).join("<br/>");

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
  nameMap: Map<string, NameMapEntry>,
  persona: PersonaInfo | null,
): string {
  const content = lines.map((l) => formatInline(l, nameMap)).join("<br/>");

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

function renderNarration(lines: string[], nameMap: Map<string, NameMapEntry>): string {
  const content = lines.map((l) => formatInline(l, nameMap)).join("<br/>");
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

// ── Main renderer ────────────────────────────

function buildHTML(): string {
  const nameMap = buildNameMap();

  const sceneFiles = files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );
  if (sceneFiles.length === 0) return renderEmpty();

  const allContent = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const { cleaned, choices } = extractChoices(allContent);

  const fallbackColorMap = new Map<string, string>();
  const persona = resolvePersona(nameMap);

  const parsed = cleaned
    .split("\n")
    .map(parseLine)
    .filter((l): l is ChatLine => l !== null)
    .map((l) => resolveAvatar(l, nameMap));
  const groups = groupLines(parsed);

  if (groups.length === 0) return renderEmpty();

  const rendered = groups
    .map((g) => {
      switch (g.type) {
        case "user":
          return renderUser(g.lines, nameMap, persona);
        case "character":
          return renderCharacter(g, nameMap, fallbackColorMap);
        case "narration":
          return renderNarration(g.lines, nameMap);
        case "divider":
          return renderDivider();
      }
    })
    .join("\n");

  return `${rendered}${renderChoices(choices)}<div data-chat-anchor></div>`;
}

function render(): void {
  Idiomorph.morph(root, buildHTML(), { morphStyle: "innerHTML" });
}

async function loadFiles(): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/files`);
  files = await res.json();
}

// ── data-action 핸들러 ──────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement | null)?.closest(
    "[data-action]",
  ) as HTMLElement | null;
  if (!target) return;
  const action = target.dataset.action;
  const text = (target.dataset.text ?? target.textContent ?? "").trim();
  if (!text) return;
  if (action === "send" || action === "fill") {
    void fetch(`/api/projects/${slug}/actions/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }
});

// ── SSE ─────────────────────────────────────────────────────────────────────

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
  const { pendingToolCalls } = JSON.parse((e as MessageEvent<string>).data);
  state = { ...state, pendingToolCalls };
  render();
});

await loadFiles();
render();
