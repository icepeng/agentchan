// ─────────────────────────────────────────────────────────────────────────────
//   character-chat renderer · "The Chamber Theatre"
//
//   · 캐릭터는 말풍선이 아니라 감정 포트레이트로 무대를 점유한다.
//   · 대사는 letterpress 자막 플레이트. 이름은 명판처럼 small-caps.
//   · 내레이션은 hairline rule 사이의 무대 지시문.
//   · 씬 전환(---)은 달빛 물결(moonwash) 리플 + 랜턴 글리프.
//   · 사용자(> ...)는 객석에서 들려오는 우측 마진의 속삭임.
//   · 씬 말미에 `[choice] ...` 라인이 있으면 밀랍 봉인 칩으로 렌더.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentState, ProjectFile, TextFile } from "@agentchan/types";
import { Idiomorph } from "/api/host/lib/idiomorph.js";

const slug = location.pathname.match(/\/projects\/([^/]+)\//)?.[1] ?? "";
const baseUrl = `/api/projects/${slug}/files`;
const reel = document.querySelector<HTMLElement>(".cr-reel")!;

let state: AgentState = {
  messages: [],
  pendingToolCalls: [],
  isStreaming: false,
};
let files: ProjectFile[] = [];

// ── Palette ──────────────────────────────────────────────────────────────────

const FALLBACK_COLORS = [
  "#2dd4bf",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#38bdf8",
  "#f87171",
];

// ── Stage: 캐릭터·페르소나 인덱스 + 블로킹 ───────────────────────────────────

interface CharacterEntry {
  dir: string;
  slug: string;
  avatar: string;
  color: string;
  displayName: string;
  role: "character" | "persona";
}

interface Stage {
  byName: Map<string, CharacterEntry>;
  sideByName: Map<string, "left" | "right">;
  persona: CharacterEntry | null;
}

function buildStage(): Stage {
  const byName = new Map<string, CharacterEntry>();
  let persona: CharacterEntry | null = null;
  let fallbackIdx = 0;

  for (const file of files) {
    if (file.type !== "text" || !file.frontmatter) continue;
    const fm = file.frontmatter;
    const isPersona = fm.role === "persona";
    const hasAvatar = typeof fm["avatar-image"] === "string" && fm["avatar-image"];
    if (!hasAvatar && !isPersona) continue;

    const dir = file.path.slice(0, file.path.lastIndexOf("/"));
    const slug = dir.slice(dir.lastIndexOf("/") + 1);
    const displayName = String(fm["display-name"] ?? fm.name ?? slug);
    const avatar = typeof fm["avatar-image"] === "string" ? String(fm["avatar-image"]) : "";
    const color =
      typeof fm.color === "string" && fm.color
        ? fm.color
        : FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];

    const entry: CharacterEntry = {
      dir,
      slug,
      avatar,
      color,
      displayName,
      role: isPersona ? "persona" : "character",
    };

    if (entry.role === "persona" && !persona) persona = entry;

    const register = (raw: unknown) => {
      if (!raw) return;
      for (const part of String(raw).split(",")) {
        const name = part.trim();
        if (name && !byName.has(name)) byName.set(name, entry);
      }
    };
    register(fm.names);
    register(fm["display-name"]);
    register(fm.name);
  }

  return { byName, sideByName: new Map(), persona };
}

function sideFor(stage: Stage, name: string): "left" | "right" {
  const existing = stage.sideByName.get(name);
  if (existing) return existing;
  const side: "left" | "right" = stage.sideByName.size % 2 === 0 ? "left" : "right";
  stage.sideByName.set(name, side);
  return side;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

type Beat =
  | {
      kind: "presence";
      name: string;
      emotion: string | null;
      lines: string[];
      side: "left" | "right";
    }
  | { kind: "whisper"; lines: string[] }
  | { kind: "direction"; text: string }
  | { kind: "divider" }
  | { kind: "choice"; text: string };

const RE_DIVIDER = /^---+$/;
const RE_USER = /^>\s+(.+)$/;
const RE_CHOICE = /^\[choice(?::[a-z]+)?\]\s+(.+)$/;
const RE_EMOTION_LINE = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*$/;
const RE_EMOTION_INLINE = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s+/;
const RE_SPEAKER = /^\*\*([^*\n]+?)(?::\*\*|\*\*:)\s*(.*)$/;

function parseScene(text: string, stage: Stage): Beat[] {
  const beats: Beat[] = [];
  let pendingEmotion: { slug: string; key: string } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (RE_DIVIDER.test(line)) {
      beats.push({ kind: "divider" });
      pendingEmotion = null;
      continue;
    }

    const mChoice = line.match(RE_CHOICE);
    if (mChoice) {
      beats.push({ kind: "choice", text: mChoice[1].trim() });
      continue;
    }

    const mUser = line.match(RE_USER);
    if (mUser) {
      const prev = beats[beats.length - 1];
      if (prev?.kind === "whisper") prev.lines.push(mUser[1]);
      else beats.push({ kind: "whisper", lines: [mUser[1]] });
      continue;
    }

    const mEmotion = line.match(RE_EMOTION_LINE);
    if (mEmotion) {
      pendingEmotion = { slug: mEmotion[1], key: mEmotion[2] };
      continue;
    }

    let speakerLine = line;
    let inlineEmotion: { slug: string; key: string } | null = null;
    const mInline = line.match(RE_EMOTION_INLINE);
    if (mInline) {
      inlineEmotion = { slug: mInline[1], key: mInline[2] };
      speakerLine = line.slice(mInline[0].length);
    }

    const mSpeaker = speakerLine.match(RE_SPEAKER);
    if (mSpeaker) {
      const name = mSpeaker[1].trim();
      const body = mSpeaker[2].trim();
      const entry = stage.byName.get(name);
      const side = sideFor(stage, name);

      let emotion: string | null = null;
      if (inlineEmotion && matchesSlug(inlineEmotion.slug, entry)) {
        emotion = inlineEmotion.key;
      } else if (pendingEmotion && matchesSlug(pendingEmotion.slug, entry)) {
        emotion = pendingEmotion.key;
      }
      pendingEmotion = null;

      const prev = beats[beats.length - 1];
      if (
        prev?.kind === "presence" &&
        prev.name === name &&
        emotion === null &&
        body
      ) {
        prev.lines.push(body);
      } else {
        beats.push({
          kind: "presence",
          name,
          emotion,
          lines: body ? [body] : [],
          side,
        });
      }
      continue;
    }

    beats.push({ kind: "direction", text: line });
  }

  return trimStaleChoices(beats);
}

function matchesSlug(slug: string, entry: CharacterEntry | undefined): boolean {
  if (!entry) return false;
  return entry.slug === slug;
}

function trimStaleChoices(beats: Beat[]): Beat[] {
  let lastContent = -1;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (beats[i].kind !== "choice") {
      lastContent = i;
      break;
    }
  }
  return beats.filter((b, i) => b.kind !== "choice" || i > lastContent);
}

// ── Inline formatting ────────────────────────────────────────────────────────

function escape(s: string, { attr = false }: { attr?: boolean } = {}): string {
  const base = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return attr ? base.replace(/"/g, "&quot;") : base;
}

function formatInline(text: string): string {
  let out = text.replace(/"([^"\n]+)"/g, "“$1”");
  out = escape(out);
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*\n]+?)\*/g, '<em class="cr-action">$1</em>');
  return out;
}

// ── Portrait ─────────────────────────────────────────────────────────────────

function portraitUrl(dir: string, key: string): string {
  return `${baseUrl}/${dir}/${key}`;
}

function renderPortrait(
  stage: Stage,
  name: string,
  emotion: string | null,
): string {
  const entry = stage.byName.get(name);
  const displayName = entry?.displayName ?? name;
  const initial = displayName.charAt(0).toUpperCase();
  const key = emotion ?? entry?.avatar ?? "";
  if (!entry || !key) {
    return `<div class="cr-silhouette" aria-label="${escape(displayName, { attr: true })}"><span>${escape(initial)}</span></div>`;
  }
  const src = portraitUrl(entry.dir, key);
  const id = `${entry.slug}-${emotion ?? "rest"}`;
  return `
    <figure class="cr-portrait" data-portrait="${escape(id, { attr: true })}">
      <div class="cr-portrait-halo"></div>
      <img class="cr-portrait-img" src="${escape(src, { attr: true })}" alt="${escape(displayName, { attr: true })}" onerror="this.closest('.cr-portrait').dataset.fallback='1'" />
      <div class="cr-portrait-fallback" aria-hidden="true"><span>${escape(initial)}</span></div>
      <div class="cr-portrait-gloss"></div>
      <div class="cr-portrait-vignette"></div>
    </figure>`;
}

// ── Beat renderers ───────────────────────────────────────────────────────────

function renderPresence(
  stage: Stage,
  beat: Extract<Beat, { kind: "presence" }>,
  id: string,
): string {
  const entry = stage.byName.get(beat.name);
  const displayName = entry?.displayName ?? beat.name;
  const color = entry?.color ?? "var(--color-accent)";
  const portrait = renderPortrait(stage, beat.name, beat.emotion);

  const body = beat.lines.length
    ? beat.lines.map(formatInline).join('<span class="cr-soft-break"></span>')
    : "";

  return `
    <section id="${id}" class="cr-presence cr-presence--${beat.side}" style="--c: ${escape(color, { attr: true })}">
      <div class="cr-presence-portrait">${portrait}</div>
      <div class="cr-presence-caption">
        <div class="cr-nameplate">
          <span class="cr-nameplate-mark"></span>
          <span class="cr-nameplate-text">${escape(displayName)}</span>
          <span class="cr-nameplate-mark"></span>
        </div>
        ${body ? `<div class="cr-caption-body">${body}</div>` : ""}
      </div>
    </section>`;
}

function renderWhisper(
  stage: Stage,
  beat: Extract<Beat, { kind: "whisper" }>,
  id: string,
): string {
  const label = stage.persona?.displayName ?? "";
  const content = beat.lines
    .map(formatInline)
    .join('<span class="cr-soft-break"></span>');
  return `
    <aside id="${id}" class="cr-whisper">
      <span class="cr-whisper-text">${content}</span>
      ${label ? `<span class="cr-whisper-label">${escape(label)}</span>` : ""}
    </aside>`;
}

function renderDirection(
  beat: Extract<Beat, { kind: "direction" }>,
  id: string,
): string {
  let t = beat.text;
  const m = t.match(/^\*(.+)\*$/);
  if (m) t = m[1];
  return `
    <div id="${id}" class="cr-direction">
      <span class="cr-direction-rule"></span>
      <span class="cr-direction-text">${formatInline(t)}</span>
      <span class="cr-direction-rule"></span>
    </div>`;
}

function renderDivider(id: string): string {
  return `
    <div id="${id}" class="cr-divider" role="separator">
      <svg class="cr-ripple" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
        <path class="cr-ripple-path" d="M 0 20 Q 25 10, 50 20 T 100 20 T 150 20 T 200 20" />
        <path class="cr-ripple-path cr-ripple-path--echo" d="M 200 20 Q 225 30, 250 20 T 300 20 T 350 20 T 400 20" />
      </svg>
      <span class="cr-divider-glyph" aria-hidden="true">✦</span>
    </div>`;
}

function renderChoiceBar(
  chips: Extract<Beat, { kind: "choice" }>[],
  id: string,
): string {
  const buttons = chips
    .map(
      (c) => `
      <button type="button" class="cr-choice" data-action="fill" data-text="${escape(c.text, { attr: true })}">
        <span class="cr-choice-seal" aria-hidden="true"></span>
        <span class="cr-choice-text">${escape(c.text)}</span>
      </button>`,
    )
    .join("");
  return `<div id="${id}" class="cr-choice-bar">${buttons}</div>`;
}

function renderEmpty(): string {
  return `
    <div class="cr-empty">
      <div class="cr-empty-rule"></div>
      <div class="cr-empty-candle" aria-hidden="true">
        <span class="cr-empty-flame"></span>
        <span class="cr-empty-stem"></span>
      </div>
      <div class="cr-empty-title">무대가 기다리고 있습니다</div>
      <div class="cr-empty-sub">첫 장면이 기록되면 이 방이 깨어납니다</div>
      <div class="cr-empty-rule"></div>
    </div>`;
}

function renderBeats(beats: Beat[], stage: Stage): string {
  const out: string[] = [];
  let i = 0;
  while (i < beats.length) {
    const b = beats[i];
    const id = `cr-b-${i}`;
    if (b.kind === "choice") {
      const chips: Extract<Beat, { kind: "choice" }>[] = [];
      while (i < beats.length && beats[i].kind === "choice") {
        chips.push(beats[i] as Extract<Beat, { kind: "choice" }>);
        i++;
      }
      out.push(renderChoiceBar(chips, id));
      continue;
    }
    switch (b.kind) {
      case "presence":
        out.push(renderPresence(stage, b, id));
        break;
      case "whisper":
        out.push(renderWhisper(stage, b, id));
        break;
      case "direction":
        out.push(renderDirection(b, id));
        break;
      case "divider":
        out.push(renderDivider(id));
        break;
    }
    i++;
  }
  return out.join("\n");
}

// ── Main renderer ────────────────────────────────────────────────────────────

function buildHTML(): string {
  const stage = buildStage();

  const sceneFiles = files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );
  const sceneText = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  if (!sceneText.trim()) return renderEmpty();
  const beats = parseScene(sceneText, stage);
  if (beats.length === 0) return renderEmpty();
  return renderBeats(beats, stage);
}

function render(): void {
  Idiomorph.morph(reel, buildHTML(), { morphStyle: "innerHTML" });
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
