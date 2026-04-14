// ─────────────────────────────────────────────────────────────────────────────
//   character-chat renderer  ·  "The Chamber Theatre"
//
//   챗이 아니라 촛불 켜진 방에서 펼쳐지는 한 장면이다.
//
//   · 캐릭터는 말풍선이 아니라 감정 포트레이트로 무대를 점유한다.
//   · 대사는 letterpress 자막 플레이트. 이름은 명판처럼 small-caps.
//   · 내레이션은 hairline rule 사이의 무대 지시문.
//   · 씬 전환(---)은 달빛 물결(moonwash) 리플 + 랜턴 글리프.
//   · 사용자(> ...)는 객석에서 들려오는 우측 마진의 속삭임.
//   · 씬 말미에 `[choice] ...` 라인이 있으면 밀랍 봉인 칩으로 렌더.
//
//   렌더러는 pure `(files) => HTML` — 세션/스킬 상태에 접근하지 않는다.
//   Idiomorph가 DOM을 morph하므로 CSS 애니메이션은 재렌더 간에 지속된다.
// ─────────────────────────────────────────────────────────────────────────────

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
  ctx: RenderContext;
  byName: Map<string, CharacterEntry>;
  sideByName: Map<string, "left" | "right">;
  persona: CharacterEntry | null;
}

function buildStage(ctx: RenderContext): Stage {
  const byName = new Map<string, CharacterEntry>();
  let persona: CharacterEntry | null = null;
  let fallbackIdx = 0;

  for (const file of ctx.files) {
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

  return { ctx, byName, sideByName: new Map(), persona };
}

function sideFor(stage: Stage, name: string): "left" | "right" {
  const existing = stage.sideByName.get(name);
  if (existing) return existing;
  const side: "left" | "right" = stage.sideByName.size % 2 === 0 ? "left" : "right";
  stage.sideByName.set(name, side);
  return side;
}

// ── Parsing ──────────────────────────────────────────────────────────────────
//
//   Beat = 파싱된 장면의 한 단위. Idiomorph가 안정적으로 diff할 수 있도록
//   렌더 결과는 beat별로 독립 엘리먼트를 갖는다.
//
// ─────────────────────────────────────────────────────────────────────────────

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
  | { kind: "choice"; mode: "fill" | "send"; text: string };

const RE_DIVIDER = /^---+$/;
const RE_USER = /^>\s+(.+)$/;
const RE_CHOICE = /^\[choice(?::(fill|send))?\]\s+(.+)$/;
const RE_EMOTION_LINE = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*$/;
const RE_EMOTION_INLINE = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s+/;
// `**Name:**` (콜론이 bold 내부) 와 `**Name**:` (콜론이 bold 외부) 양쪽 지원
const RE_SPEAKER = /^\*\*([^*\n]+?)(?::\*\*|\*\*:)\s*(.*)$/;

function parseScene(text: string, stage: Stage): Beat[] {
  const beats: Beat[] = [];
  // Emotion 토큰은 빈 줄을 건너뛰어 다음 presence 라인에 바인딩된다.
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
      const mode = (mChoice[1] as "fill" | "send" | undefined) ?? "fill";
      beats.push({ kind: "choice", mode, text: mChoice[2].trim() });
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

    // Legacy 지원: `[slug:key] **Name:** "..."` 형식도 같은 턴의 포트레이트로 해석
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
        // 본문이 비어도 감정 교체만을 위한 포트레이트 턴을 허용한다
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

    // 그 외는 모두 내레이션 — stage direction으로 렌더.
    // pendingEmotion은 유지: 내레이션이 끼어도 다음 matching presence까지 이어간다.
    beats.push({ kind: "direction", text: line });
  }

  return trimStaleChoices(beats);
}

function matchesSlug(slug: string, entry: CharacterEntry | undefined): boolean {
  if (!entry) return false;
  return entry.slug === slug;
}

// 지난 턴에 배치된 오래된 [choice] 라인은 무시하고, 현재 씬 말미의 choice
// 클러스터만 살린다. 에이전트가 이전 choice 라인을 씬 파일에 그대로 남겨도
// 화면이 지저분해지지 않는다.
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

// `"`는 어트리뷰트에서만 위험 — 텍스트 본문에서는 보존해야 스마트 쿼트 변환이 동작한다.
function escape(s: string, { attr = false }: { attr?: boolean } = {}): string {
  const base = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return attr ? base.replace(/"/g, "&quot;") : base;
}

function formatInline(text: string): string {
  let out = text.replace(/"([^"\n]+)"/g, "\u201c$1\u201d");
  out = escape(out);
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*\n]+?)\*/g, '<em class="cr-action">$1</em>');
  return out;
}

// ── Portrait ─────────────────────────────────────────────────────────────────

function portraitUrl(ctx: RenderContext, dir: string, key: string): string {
  return `${ctx.baseUrl}/files/${dir}/${key}`;
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
  const src = portraitUrl(stage.ctx, entry.dir, key);
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
  // 전체를 감싼 별표는 벗겨낸다 — 이미 무대 지시문으로 취급
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
      <button type="button" class="cr-choice" data-action="${c.mode}" data-text="${escape(c.text, { attr: true })}">
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
  // 각 beat에 index 기반 stable id를 부여하여 Idiomorph가 재렌더 사이에 DOM을 보존하고,
  // 포트레이트 halo / candle flicker / ripple 같은 CSS 애니메이션이 리셋되지 않게 한다.
  // 씬 파일은 append-only이므로 기존 beat의 인덱스는 렌더 간에 고정된다.
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

// ── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `<style>
  /* ─── Stage frame ─────────────────────────────────────────────── */
  .cr-stage {
    position: relative;
    max-width: 880px;
    margin: 0 auto;
    padding: 56px 24px 120px;
    font-family: var(--font-family-body);
    color: var(--color-fg);
    isolation: isolate;
    min-height: 100%;
  }
  .cr-ambient {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: -1;
    overflow: hidden;
  }
  .cr-ambient-moonwash {
    position: absolute;
    inset: -20%;
    background:
      radial-gradient(ellipse 55% 40% at 25% 18%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 62%),
      radial-gradient(ellipse 50% 35% at 82% 78%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 65%);
    opacity: 0.7;
  }
  .cr-ambient-candle {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 75% 50% at 50% 42%, color-mix(in srgb, var(--color-warm) 10%, transparent), transparent 72%);
    animation: cr-candle 7s ease-in-out infinite;
    mix-blend-mode: screen;
  }
  @keyframes cr-candle {
    0%, 100% { opacity: 0.58; transform: translateY(0); }
    33%      { opacity: 0.72; transform: translateY(-2px); }
    66%      { opacity: 0.54; transform: translateY(1px); }
  }
  .cr-reel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 56px;
  }

  /* ─── Presence: 캐릭터 포트레이트 + 자막 플레이트 ─────────────── */
  .cr-presence {
    display: grid;
    gap: 32px;
    align-items: start;
    animation: cr-fade-in 0.7s ease-out;
  }
  .cr-presence--left  { grid-template-columns: 220px minmax(0, 1fr); }
  .cr-presence--right { grid-template-columns: minmax(0, 1fr) 220px; }
  .cr-presence--right .cr-presence-portrait { grid-column: 2; }
  .cr-presence--right .cr-presence-caption  { grid-column: 1; grid-row: 1; }
  .cr-presence--right .cr-nameplate         { justify-content: flex-end; }

  .cr-presence-portrait { position: relative; }
  .cr-portrait {
    position: relative;
    margin: 0;
    aspect-ratio: 1 / 1;
    border-radius: 3px;
    overflow: hidden;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent),
      0 24px 48px -20px rgba(0,0,0,0.55),
      0 2px 6px -2px rgba(0,0,0,0.3);
  }
  .cr-portrait-halo {
    position: absolute;
    inset: -35%;
    background: radial-gradient(circle, color-mix(in srgb, var(--c) 55%, transparent), transparent 58%);
    opacity: 0.28;
    z-index: 0;
    filter: blur(24px);
    pointer-events: none;
  }
  .cr-portrait-img {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    filter: saturate(1.05) contrast(1.02);
  }
  .cr-portrait-fallback {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-family-display);
    font-size: 56px;
    font-weight: 500;
    color: color-mix(in srgb, var(--c) 60%, var(--color-fg-3));
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--c) 16%, var(--color-surface)),
      color-mix(in srgb, var(--color-void) 40%, var(--color-elevated)));
  }
  .cr-portrait[data-fallback="1"] .cr-portrait-fallback { z-index: 2; }
  .cr-portrait[data-fallback="1"] .cr-portrait-img { visibility: hidden; }
  .cr-portrait-gloss {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background: linear-gradient(158deg,
      color-mix(in srgb, var(--color-warm) 14%, transparent) 0%,
      transparent 38%);
    mix-blend-mode: screen;
  }
  .cr-portrait-vignette {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    background:
      linear-gradient(to top,
        color-mix(in srgb, var(--color-void) 70%, transparent) 0%,
        transparent 48%),
      radial-gradient(ellipse at 50% 110%,
        color-mix(in srgb, var(--c) 30%, transparent) 0%,
        transparent 55%);
  }

  /* ─── Caption ────────────────────────────────────────────────── */
  .cr-presence-caption { padding-top: 8px; min-width: 0; }
  .cr-nameplate {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
    color: var(--c);
  }
  .cr-nameplate-mark {
    width: 32px;
    height: 1px;
    background: currentColor;
    opacity: 0.4;
  }
  .cr-nameplate-text {
    font-family: var(--font-family-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.26em;
    text-transform: uppercase;
  }
  .cr-caption-body {
    font-family: var(--font-family-body);
    font-size: 16.5px;
    line-height: 1.85;
    color: var(--color-fg);
    padding-left: 18px;
    border-left: 1px solid color-mix(in srgb, var(--c) 32%, transparent);
  }
  .cr-presence--right .cr-caption-body {
    padding-left: 0;
    padding-right: 18px;
    border-left: none;
    border-right: 1px solid color-mix(in srgb, var(--c) 32%, transparent);
  }
  .cr-action {
    font-style: italic;
    color: var(--color-fg-2);
    letter-spacing: 0.005em;
  }
  .cr-soft-break { display: block; height: 6px; }

  /* ─── Whisper: 우측 마진 속삭임 ───────────────────────────────── */
  .cr-whisper {
    align-self: flex-end;
    max-width: 64%;
    padding: 14px 24px 14px 30px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
    font-family: var(--font-family-body);
    font-size: 16px;
    color: var(--color-fg-2);
    font-style: italic;
    line-height: 1.7;
    border-right: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
    animation: cr-fade-in 0.6s ease-out;
  }
  .cr-whisper-text { text-align: left; }
  .cr-whisper-label {
    align-self: flex-end;
    font-family: var(--font-family-display);
    font-style: normal;
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-fg-4);
  }

  /* ─── Direction: hairline 사이의 무대 지시문 ─────────────────── */
  .cr-direction {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 20px;
    margin: 0 auto;
    max-width: 680px;
    color: var(--color-fg-3);
    animation: cr-fade-in 0.6s ease-out;
  }
  .cr-direction-rule {
    height: 1px;
    background: currentColor;
    opacity: 0.22;
  }
  .cr-direction-text {
    font-family: var(--font-family-body);
    font-size: 14px;
    font-style: italic;
    text-align: center;
    line-height: 1.6;
    letter-spacing: 0.01em;
  }
  .cr-direction-text .cr-action {
    font-style: italic;
    color: inherit;
  }

  /* ─── Divider: moonwash ripple ───────────────────────────────── */
  .cr-divider {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 40px;
    margin: 8px 0;
    color: color-mix(in srgb, var(--color-accent) 80%, var(--color-fg-3));
  }
  .cr-ripple {
    position: absolute;
    inset: 0;
    margin: auto;
    width: min(420px, 82%);
    height: 40px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    stroke-linecap: round;
  }
  .cr-ripple-path { opacity: 0.3; animation: cr-ripple 4.6s ease-in-out infinite; }
  .cr-ripple-path--echo { animation-delay: 2.3s; }
  @keyframes cr-ripple {
    0%, 100% { opacity: 0.18; }
    50%      { opacity: 0.55; }
  }
  .cr-divider-glyph {
    position: relative;
    z-index: 1;
    font-size: 13px;
    padding: 4px 10px;
    background: var(--color-base);
    color: var(--color-accent);
    letter-spacing: 0.2em;
  }

  /* ─── Choice chips: wax-seal ─────────────────────────────────── */
  .cr-choice-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    padding: 8px 0 4px;
    animation: cr-fade-in 0.8s ease-out 0.2s both;
  }
  .cr-choice {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px 10px 14px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 28%, transparent);
    background: color-mix(in srgb, var(--color-accent) 5%, transparent);
    border-radius: 999px;
    color: var(--color-fg);
    font-family: var(--font-family-body);
    font-size: 14px;
    font-style: italic;
    line-height: 1.4;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }
  .cr-choice:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  }
  .cr-choice:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-accent) 60%, transparent);
    outline-offset: 2px;
  }
  .cr-choice-seal {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 32% 30%,
        color-mix(in srgb, var(--color-warm) 85%, white) 0%,
        color-mix(in srgb, var(--color-warm) 30%, black) 90%);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--color-warm) 40%, transparent),
      0 0 8px -1px color-mix(in srgb, var(--color-warm) 40%, transparent);
    flex-shrink: 0;
  }

  /* ─── Empty state: 무대가 기다리고 있습니다 ──────────────────── */
  .cr-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 120px 0 80px;
    text-align: center;
  }
  .cr-empty-rule {
    width: 72px;
    height: 1px;
    background: var(--color-fg-4);
    opacity: 0.35;
  }
  .cr-empty-candle {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .cr-empty-flame {
    width: 10px;
    height: 14px;
    background: radial-gradient(ellipse at 50% 100%,
      var(--color-warm) 0%,
      color-mix(in srgb, var(--color-warm) 40%, transparent) 80%);
    border-radius: 50% 50% 40% 40% / 60% 60% 40% 40%;
    animation: cr-flame 2.5s ease-in-out infinite;
    filter: blur(0.4px);
    box-shadow: 0 0 16px color-mix(in srgb, var(--color-warm) 50%, transparent);
  }
  .cr-empty-stem {
    width: 2px;
    height: 36px;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--color-warm) 50%, transparent),
      transparent);
  }
  @keyframes cr-flame {
    0%, 100% { transform: scaleY(1) scaleX(1); opacity: 0.92; }
    35%      { transform: scaleY(1.12) scaleX(0.94); opacity: 1; }
    68%      { transform: scaleY(0.94) scaleX(1.06); opacity: 0.85; }
  }
  .cr-empty-title {
    font-family: var(--font-family-display);
    font-size: 13px;
    letter-spacing: 0.26em;
    color: var(--color-fg-2);
    text-transform: uppercase;
  }
  .cr-empty-sub {
    font-family: var(--font-family-body);
    font-size: 13px;
    color: var(--color-fg-4);
    font-style: italic;
    max-width: 320px;
    line-height: 1.7;
  }

  /* ─── Silhouette fallback (캐릭터 파일 없을 때) ────────────────── */
  .cr-silhouette {
    aspect-ratio: 1/1;
    border-radius: 3px;
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--color-accent) 14%, var(--color-surface)),
      color-mix(in srgb, var(--color-void) 45%, var(--color-elevated)));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-fg-3);
    font-family: var(--font-family-display);
    font-size: 52px;
    border: 1px solid color-mix(in srgb, var(--color-edge) 10%, transparent);
  }

  /* ─── Animations ─────────────────────────────────────────────── */
  @keyframes cr-fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ─── Responsive ─────────────────────────────────────────────── */
  @media (max-width: 720px) {
    .cr-stage { padding: 32px 16px 96px; }
    .cr-reel { gap: 40px; }
    .cr-presence--left,
    .cr-presence--right {
      grid-template-columns: 1fr;
      gap: 20px;
    }
    .cr-presence--right .cr-presence-portrait,
    .cr-presence--right .cr-presence-caption { grid-column: 1; }
    .cr-presence--right .cr-presence-portrait { grid-row: 1; }
    .cr-presence--right .cr-presence-caption  { grid-row: 2; }
    .cr-presence--right .cr-nameplate         { justify-content: flex-start; }
    .cr-presence--right .cr-caption-body {
      padding-left: 18px;
      padding-right: 0;
      border-left: 1px solid color-mix(in srgb, var(--c) 32%, transparent);
      border-right: none;
    }
    .cr-portrait { max-width: 180px; }
    .cr-whisper  { max-width: 82%; font-size: 15px; }
  }
</style>`;

// ── Main renderer ────────────────────────────────────────────────────────────

export function render(ctx: RenderContext): string {
  const stage = buildStage(ctx);

  const sceneFiles = ctx.files.filter(
    (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"),
  );
  const sceneText = sceneFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content)
    .join("\n\n---\n\n");

  const body = sceneText.trim() ? renderBody(sceneText, stage) : renderEmpty();

  return `${STYLES}
    <div class="cr-stage">
      <div class="cr-ambient" aria-hidden="true">
        <div class="cr-ambient-moonwash"></div>
        <div class="cr-ambient-candle"></div>
      </div>
      <div class="cr-reel">${body}</div>
      <div data-chat-anchor></div>
    </div>`;
}

function renderBody(sceneText: string, stage: Stage): string {
  const beats = parseScene(sceneText, stage);
  if (beats.length === 0) return renderEmpty();
  return renderBeats(beats, stage);
}
