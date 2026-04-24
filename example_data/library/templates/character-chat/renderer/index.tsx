/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
import "./index.css";
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
//   렌더러는 pure `(files) => ReactElement` — 세션/스킬 상태에 접근하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactElement, ReactNode } from "react";

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
  baseUrl: string;
  byName: Map<string, CharacterEntry>;
  sideByName: Map<string, "left" | "right">;
  persona: CharacterEntry | null;
}

function buildStage(files: ProjectFile[], baseUrl: string): Stage {
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

  return { baseUrl, byName, sideByName: new Map(), persona };
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
//   Beat = 파싱된 장면의 한 단위. 렌더 결과는 beat별로 독립 엘리먼트를 갖는다.
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
  | { kind: "choice"; text: string };

const RE_DIVIDER = /^---+$/;
const RE_USER = /^>\s+(.+)$/;
// `[choice:...]` 같은 legacy suffix는 허용하되 무시한다 — 모든 choice는 fill 모드.
const RE_CHOICE = /^\[choice(?::[a-z]+)?\]\s+(.+)$/;
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

function formatInline(text: string): (string | ReactElement)[] {
  // smart quotes "..." → “...”
  const quoted = text.replace(/"([^"\n]+)"/g, "“$1”");

  const parts: (string | ReactElement)[] = [];
  const pattern = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = pattern.exec(quoted)) !== null) {
    if (match.index > cursor) parts.push(quoted.slice(cursor, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`s-${idx++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(
        <em key={`i-${idx++}`} className="cr-action">
          {match[2]}
        </em>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < quoted.length) parts.push(quoted.slice(cursor));
  return parts;
}

// 여러 라인을 soft-break로 join — React fragment로 각 라인 사이에 <span>을 삽입
function renderLinesWithBreaks(lines: string[]): ReactNode {
  const nodes: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) nodes.push(<span key={`br-${i}`} className="cr-soft-break" />);
    nodes.push(<span key={`ln-${i}`}>{formatInline(line)}</span>);
  });
  return nodes;
}

// ── Portrait ─────────────────────────────────────────────────────────────────

function portraitUrl(baseUrl: string, dir: string, key: string): string {
  return `${baseUrl}/files/${dir}/${key}`;
}

function Portrait({
  stage,
  name,
  emotion,
}: {
  stage: Stage;
  name: string;
  emotion: string | null;
}): ReactElement {
  const entry = stage.byName.get(name);
  const displayName = entry?.displayName ?? name;
  const initial = displayName.charAt(0).toUpperCase();
  const key = emotion ?? entry?.avatar ?? "";
  if (!entry || !key) {
    return (
      <div className="cr-silhouette" aria-label={displayName}>
        <span>{initial}</span>
      </div>
    );
  }
  const src = portraitUrl(stage.baseUrl, entry.dir, key);
  const id = `${entry.slug}-${emotion ?? "rest"}`;
  return (
    <figure className="cr-portrait" data-portrait={id}>
      <div className="cr-portrait-halo" />
      <img
        className="cr-portrait-img"
        src={src}
        alt={displayName}
        onError={(e) => {
          const fig = (e.currentTarget as HTMLImageElement).closest(".cr-portrait");
          if (fig instanceof HTMLElement) fig.dataset.fallback = "1";
        }}
      />
      <div className="cr-portrait-fallback" aria-hidden="true">
        <span>{initial}</span>
      </div>
      <div className="cr-portrait-gloss" />
      <div className="cr-portrait-vignette" />
    </figure>
  );
}

// ── Beat renderers ───────────────────────────────────────────────────────────

function PresenceBeat({
  stage,
  beat,
  id,
}: {
  stage: Stage;
  beat: Extract<Beat, { kind: "presence" }>;
  id: string;
}): ReactElement {
  const entry = stage.byName.get(beat.name);
  const displayName = entry?.displayName ?? beat.name;
  const color = entry?.color ?? "var(--color-accent)";

  return (
    <section
      id={id}
      className={`cr-presence cr-presence--${beat.side}`}
      style={{ ["--c" as string]: color }}
    >
      <div className="cr-presence-portrait">
        <Portrait stage={stage} name={beat.name} emotion={beat.emotion} />
      </div>
      <div className="cr-presence-caption">
        <div className="cr-nameplate">
          <span className="cr-nameplate-mark" />
          <span className="cr-nameplate-text">{displayName}</span>
          <span className="cr-nameplate-mark" />
        </div>
        {beat.lines.length > 0 ? (
          <div className="cr-caption-body">{renderLinesWithBreaks(beat.lines)}</div>
        ) : null}
      </div>
    </section>
  );
}

function WhisperBeat({
  stage,
  beat,
  id,
}: {
  stage: Stage;
  beat: Extract<Beat, { kind: "whisper" }>;
  id: string;
}): ReactElement {
  const label = stage.persona?.displayName ?? "";
  return (
    <aside id={id} className="cr-whisper">
      <span className="cr-whisper-text">{renderLinesWithBreaks(beat.lines)}</span>
      {label ? <span className="cr-whisper-label">{label}</span> : null}
    </aside>
  );
}

function DirectionBeat({
  beat,
  id,
}: {
  beat: Extract<Beat, { kind: "direction" }>;
  id: string;
}): ReactElement {
  // 전체를 감싼 별표는 벗겨낸다 — 이미 무대 지시문으로 취급
  let t = beat.text;
  const m = t.match(/^\*(.+)\*$/);
  if (m) t = m[1];
  return (
    <div id={id} className="cr-direction">
      <span className="cr-direction-rule" />
      <span className="cr-direction-text">{formatInline(t)}</span>
      <span className="cr-direction-rule" />
    </div>
  );
}

function DividerBeat({ id }: { id: string }): ReactElement {
  return (
    <div id={id} className="cr-divider" role="separator">
      <svg
        className="cr-ripple"
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="cr-ripple-path"
          d="M 0 20 Q 25 10, 50 20 T 100 20 T 150 20 T 200 20"
        />
        <path
          className="cr-ripple-path cr-ripple-path--echo"
          d="M 200 20 Q 225 30, 250 20 T 300 20 T 350 20 T 400 20"
        />
      </svg>
      <span className="cr-divider-glyph" aria-hidden="true">
        ✦
      </span>
    </div>
  );
}

function ChoiceBar({
  chips,
  id,
  actions,
}: {
  chips: Extract<Beat, { kind: "choice" }>[];
  id: string;
  actions: RendererActions;
}): ReactElement {
  return (
    <div id={id} className="cr-choice-bar">
      {chips.map((c, i) => (
        <button
          key={`c-${i}`}
          type="button"
          className="cr-choice"
          onClick={() => actions.fill(c.text)}
        >
          <span className="cr-choice-seal" aria-hidden="true" />
          <span className="cr-choice-text">{c.text}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState(): ReactElement {
  return (
    <div className="cr-empty">
      <div className="cr-empty-rule" />
      <div className="cr-empty-candle" aria-hidden="true">
        <span className="cr-empty-flame" />
        <span className="cr-empty-stem" />
      </div>
      <div className="cr-empty-title">무대가 기다리고 있습니다</div>
      <div className="cr-empty-sub">첫 장면이 기록되면 이 방이 깨어납니다</div>
      <div className="cr-empty-rule" />
    </div>
  );
}

function renderBeats(
  beats: Beat[],
  stage: Stage,
  actions: RendererActions,
): ReactElement[] {
  // 각 beat에 index 기반 stable id를 부여하여 재렌더 사이에 DOM을 보존하고,
  // 포트레이트 halo / candle flicker / ripple 같은 CSS 애니메이션이 리셋되지 않게 한다.
  // 씬 파일은 append-only이므로 기존 beat의 인덱스는 렌더 간에 고정된다.
  const out: ReactElement[] = [];
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
      out.push(<ChoiceBar key={id} chips={chips} id={id} actions={actions} />);
      continue;
    }
    switch (b.kind) {
      case "presence":
        out.push(<PresenceBeat key={id} stage={stage} beat={b} id={id} />);
        break;
      case "whisper":
        out.push(<WhisperBeat key={id} stage={stage} beat={b} id={id} />);
        break;
      case "direction":
        out.push(<DirectionBeat key={id} beat={b} id={id} />);
        break;
      case "divider":
        out.push(<DividerBeat key={id} id={id} />);
        break;
    }
    i++;
  }
  return out;
}

// ── Styles ───────────────────────────────────────────────────────────────────


// ── Main renderer ────────────────────────────────────────────────────────────

function RendererContent({ files, baseUrl, actions }: RendererContentProps): ReactElement {
  const stage = buildStage(files, baseUrl);

  const sceneFiles = files
    .filter((f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"))
    .sort((a, b) => a.path.localeCompare(b.path));
  const sceneText = sceneFiles.map((f) => f.content).join("\n\n---\n\n");

  const beats = sceneText.trim() ? parseScene(sceneText, stage) : [];
  const showEmpty = beats.length === 0;

  return (
    <div className="cr-stage">
      <div className="cr-reel">
        {showEmpty ? <EmptyState /> : renderBeats(beats, stage, actions)}
      </div>
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
