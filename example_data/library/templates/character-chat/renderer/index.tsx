/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
import "./index.css";
// ─────────────────────────────────────────────────────────────────────────────
//   character-chat renderer  ·  RP chat surface
//
//   딥 네이비 배경 위의 RP 채팅. 캐릭터는 좌측 둥근사각 아바타(고정 avatar
//   이미지) + 이름 + 발화로 배치되고, 같은 화자가 연속이면 아바타 자리는
//   비워진다. 행동(*...*)은 인라인 italic이 아니라 좌측 액센트 막대를 가진
//   블록 레벨 indent-bar로 렌더되어 한국어에서도 자연스럽다. 사용자(> ...)는
//   우측 정렬에 우측 teal hairline. 씬 전환(---)은 ripple + 글리프, 선택
//   칩(`[choice]`)은 미니멀 사각형 + dot.
//
//   `[slug:assets/key]` 토큰(단독 줄)은 본문 중간에 삽입되는 강조 일러스트
//   카드로 렌더된다 — 아바타 표정을 바꾸지 않는다.
//
//   `theme()`은 host에 navy/teal 컬러 팔레트를 알려 cr-stage 외부 chrome도
//   같은 톤으로 흐르게 한다.
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
type RendererTheme = Agentchan.RendererTheme;

interface RendererContentProps {
  state: AgentState;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
}

// ── Theme ────────────────────────────────────────────────────────────────────

const RP_THEME: RendererTheme = {
  base: {
    void: "#070b15",
    base: "#0e1626",
    surface: "#15203a",
    elevated: "#1d2740",
    accent: "#3da89a",
    fg: "#d8e4f0",
    fg2: "#9aa9bf",
    fg3: "#6a7790",
    edge: "#1d2740",
  },
  prefersScheme: "dark",
};

// ── Palette ──────────────────────────────────────────────────────────────────

const FALLBACK_COLORS = [
  "#5eead4",
  "#fde68a",
  "#c4b5fd",
  "#fbcfe8",
  "#86efac",
  "#fdba74",
  "#7dd3fc",
  "#fca5a5",
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
  bySlug: Map<string, CharacterEntry>;
  sideByName: Map<string, "left" | "right">;
  persona: CharacterEntry | null;
}

function buildStage(files: ProjectFile[], baseUrl: string): Stage {
  const byName = new Map<string, CharacterEntry>();
  const bySlug = new Map<string, CharacterEntry>();
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

    bySlug.set(slug, entry);
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

  return { baseUrl, byName, bySlug, sideByName: new Map(), persona };
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
//   `[slug:assets/key]` 단독 줄은 illustration beat로 본문 흐름에 삽입된다.
//
// ─────────────────────────────────────────────────────────────────────────────

type Beat =
  | {
      kind: "presence";
      name: string;
      lines: string[];
      side: "left" | "right";
    }
  | { kind: "illustration"; slug: string; key: string }
  | { kind: "whisper"; lines: string[] }
  | { kind: "direction"; text: string }
  | { kind: "divider" }
  | { kind: "choice"; text: string };

const RE_DIVIDER = /^---+$/;
const RE_USER = /^>\s+(.+)$/;
// `[choice:...]` 같은 legacy suffix는 허용하되 무시한다 — 모든 choice는 fill 모드.
const RE_CHOICE = /^\[choice(?::[a-z]+)?\]\s+(.+)$/;
const RE_ILLUSTRATION_LINE = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s*$/;
const RE_ILLUSTRATION_INLINE = /^\[([a-z0-9][a-z0-9-]*):([^\]]+)\]\s+/;
// `**Name:**` (콜론이 bold 내부) 와 `**Name**:` (콜론이 bold 외부) 양쪽 지원
const RE_SPEAKER = /^\*\*([^*\n]+?)(?::\*\*|\*\*:)\s*(.*)$/;

function parseScene(text: string, stage: Stage): Beat[] {
  const beats: Beat[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (RE_DIVIDER.test(line)) {
      beats.push({ kind: "divider" });
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

    // 단독 `[slug:assets/key]` 줄 — 본문에 삽입되는 일러스트
    const mIllust = line.match(RE_ILLUSTRATION_LINE);
    if (mIllust) {
      beats.push({ kind: "illustration", slug: mIllust[1], key: mIllust[2] });
      continue;
    }

    // Legacy 지원: `[slug:key] **Name:** "..."` — 일러스트를 먼저 떼고 화자 라인은 별도 처리
    let speakerLine = line;
    const mInline = line.match(RE_ILLUSTRATION_INLINE);
    if (mInline) {
      beats.push({ kind: "illustration", slug: mInline[1], key: mInline[2] });
      speakerLine = line.slice(mInline[0].length);
    }

    const mSpeaker = speakerLine.match(RE_SPEAKER);
    if (mSpeaker) {
      const name = mSpeaker[1].trim();
      const body = mSpeaker[2].trim();
      const side = sideFor(stage, name);

      const prev = beats[beats.length - 1];
      if (prev?.kind === "presence" && prev.name === name && body) {
        prev.lines.push(body);
      } else {
        beats.push({
          kind: "presence",
          name,
          lines: body ? [body] : [],
          side,
        });
      }
      continue;
    }

    // 그 외는 모두 내레이션 — stage direction으로 렌더.
    beats.push({ kind: "direction", text: line });
  }

  return trimStaleChoices(beats);
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
//
//   formatInline은 한 라인의 inline 부분(따옴표·plain·bold)만 처리한다.
//   행동 토큰(*...*)은 splitLineSegments에서 미리 떼어내 block-level
//   `cr-action-block`으로 따로 렌더하므로 여기엔 도달하지 않는다.
//   italic 마크업은 한국어 폰트와 어울리지 않아 사용하지 않는다.
//
// ─────────────────────────────────────────────────────────────────────────────

function formatInline(text: string): (string | ReactElement)[] {
  // smart quotes "..." → “...”
  const quoted = text.replace(/"([^"\n]+)"/g, "“$1”");

  const parts: (string | ReactElement)[] = [];
  const pattern = /\*\*([^*\n]+?)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = pattern.exec(quoted)) !== null) {
    if (match.index > cursor) parts.push(quoted.slice(cursor, match.index));
    parts.push(<strong key={`s-${idx++}`}>{match[1]}</strong>);
    cursor = match.index + match[0].length;
  }
  if (cursor < quoted.length) parts.push(quoted.slice(cursor));
  return parts;
}

type LineSegment =
  | { kind: "inline"; parts: (string | ReactElement)[] }
  | { kind: "action"; text: string };

// 한 라인 안의 `*action*` 토큰을 block-level segment로 떼어내고,
// 나머지는 inline 텍스트(따옴표/bold 포함)로 보존한다.
function splitLineSegments(line: string): LineSegment[] {
  const segs: LineSegment[] = [];
  const pattern = /\*([^*\n]+?)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      const inline = line.slice(cursor, match.index).trim();
      if (inline) segs.push({ kind: "inline", parts: formatInline(inline) });
    }
    segs.push({ kind: "action", text: match[1].trim() });
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) {
    const inline = line.slice(cursor).trim();
    if (inline) segs.push({ kind: "inline", parts: formatInline(inline) });
  }
  return segs;
}

// ── Portrait ─────────────────────────────────────────────────────────────────

function characterImageUrl(baseUrl: string, dir: string, key: string): string {
  return `${baseUrl}/files/${dir}/${key}`;
}

function Portrait({
  stage,
  name,
}: {
  stage: Stage;
  name: string;
}): ReactElement {
  const entry = stage.byName.get(name);
  const displayName = entry?.displayName ?? name;
  const key = entry?.avatar ?? "";
  if (!entry || !key) {
    return (
      <div className="cr-silhouette" aria-label={displayName}>
        <span>?</span>
      </div>
    );
  }
  const src = characterImageUrl(stage.baseUrl, entry.dir, key);
  return (
    <figure className="cr-portrait" data-portrait={entry.slug}>
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
        <span>?</span>
      </div>
    </figure>
  );
}

// ── Beat renderers ───────────────────────────────────────────────────────────

function PresenceBeat({
  stage,
  beat,
  id,
  collapsed,
}: {
  stage: Stage;
  beat: Extract<Beat, { kind: "presence" }>;
  id: string;
  collapsed: boolean;
}): ReactElement {
  const entry = stage.byName.get(beat.name);
  const displayName = entry?.displayName ?? beat.name;
  const color = entry?.color ?? "var(--color-accent)";

  return (
    <section
      id={id}
      className="cr-presence"
      data-collapsed={collapsed ? "1" : "0"}
      style={{ ["--c" as string]: color }}
    >
      <div className="cr-presence-portrait">
        <Portrait stage={stage} name={beat.name} />
      </div>
      <div className="cr-presence-caption">
        {!collapsed ? (
          <div className="cr-nameplate">
            <span className="cr-nameplate-mark" />
            <span className="cr-nameplate-text">{displayName}</span>
          </div>
        ) : null}
        {beat.lines.length > 0 ? (
          <div className="cr-caption-body">{renderCaptionLines(beat.lines)}</div>
        ) : null}
      </div>
    </section>
  );
}

// 라인 배열을 block(action) / inline 흐름으로 변환한다.
// 인접한 inline 부분은 한 줄로 묶어 가독성을 살리고, action 토큰은 사이에
// 끼어들어 block-level indent bar를 형성한다.
function renderCaptionLines(lines: string[]): ReactNode {
  const out: ReactNode[] = [];
  let pending: ReactNode[] = [];
  let lineIdx = 0;
  let segIdx = 0;

  const flushInline = () => {
    if (pending.length === 0) return;
    out.push(
      <div className="cr-caption-line" key={`l-${lineIdx++}`}>
        {pending}
      </div>,
    );
    pending = [];
  };

  for (const line of lines) {
    const segs = splitLineSegments(line);
    if (segs.length === 0) continue;
    let appendedInline = false;
    for (const seg of segs) {
      if (seg.kind === "action") {
        flushInline();
        out.push(
          <span className="cr-action-block" key={`a-${segIdx++}`}>
            {seg.text}
          </span>,
        );
      } else {
        if (appendedInline) pending.push(" ");
        pending.push(
          <span key={`s-${segIdx++}`}>{seg.parts}</span>,
        );
        appendedInline = true;
      }
    }
    flushInline();
  }
  flushInline();
  return out;
}

function IllustrationBeat({
  stage,
  beat,
  id,
}: {
  stage: Stage;
  beat: Extract<Beat, { kind: "illustration" }>;
  id: string;
}): ReactElement | null {
  const entry = stage.bySlug.get(beat.slug);
  const dir = entry?.dir ?? `characters/${beat.slug}`;
  const src = characterImageUrl(stage.baseUrl, dir, beat.key);
  const color = entry?.color ?? "var(--color-accent)";
  const displayName = entry?.displayName ?? beat.slug;
  const keyName = beat.key.replace(/^assets\//, "");
  return (
    <figure
      id={id}
      className="cr-illustration"
      style={{ ["--c" as string]: color }}
    >
      <div className="cr-illustration-frame">
        <img
          className="cr-illustration-img"
          src={src}
          alt={`${displayName} — ${keyName}`}
          onError={(e) => {
            const fig = (e.currentTarget as HTMLImageElement).closest(".cr-illustration");
            if (fig instanceof HTMLElement) fig.dataset.fallback = "1";
          }}
        />
        <div className="cr-illustration-glow" aria-hidden="true" />
      </div>
      <figcaption className="cr-illustration-caption">
        <span className="cr-illustration-name">{displayName}</span>
        <span className="cr-illustration-dot">·</span>
        <span className="cr-illustration-key">{keyName}</span>
      </figcaption>
    </figure>
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
  const label = stage.persona?.displayName ?? "you";
  const nodes: ReactNode[] = [];
  beat.lines.forEach((line, i) => {
    if (i > 0) nodes.push(<span key={`br-${i}`} className="cr-soft-break" />);
    nodes.push(<span key={`ln-${i}`}>{formatInline(line)}</span>);
  });
  return (
    <aside id={id} className="cr-whisper">
      <span className="cr-whisper-text">{nodes}</span>
      <span className="cr-whisper-label">{label}</span>
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

// 한글 마지막 음절의 종성 유무로 "와"/"과" 결정. 한글 외 글자는 "과"로 fallback.
function joinWaGwa(name: string): string {
  const last = name.charCodeAt(name.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) {
    const jong = (last - 0xac00) % 28;
    return name + (jong === 0 ? "와" : "과");
  }
  return name + "과";
}

function generateStarters(stage: Stage): string[] {
  const characters: CharacterEntry[] = [];
  const seen = new Set<string>();
  for (const entry of stage.bySlug.values()) {
    if (entry.role !== "character") continue;
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    characters.push(entry);
  }

  const starters: string[] = [];
  for (const c of characters.slice(0, 3)) {
    starters.push(`${joinWaGwa(c.displayName)} 처음 만나는 장면으로 시작해줘`);
  }
  if (characters.length === 0) {
    starters.push("새 캐릭터를 만들어 첫 장면을 시작해줘");
  }
  starters.push("이 세계에서 새로운 장면을 시작해줘");
  return starters;
}

function EmptyState({
  stage,
  actions,
}: {
  stage: Stage;
  actions: RendererActions;
}): ReactElement {
  const starters = generateStarters(stage);
  return (
    <div className="cr-empty">
      <div className="cr-empty-rule" />
      <div className="cr-empty-candle" aria-hidden="true">
        <span className="cr-empty-flame" />
        <span className="cr-empty-stem" />
      </div>
      <div className="cr-empty-title">무대가 기다리고 있습니다</div>
      <div className="cr-empty-sub">막막하다면, 아래 한 줄을 골라 시작하세요</div>
      {starters.length > 0 ? (
        <div className="cr-empty-starters">
          {starters.map((s, i) => (
            <button
              key={`st-${i}`}
              type="button"
              className="cr-choice"
              onClick={() => actions.fill(s)}
            >
              <span className="cr-choice-seal" aria-hidden="true" />
              <span className="cr-choice-text">{s}</span>
            </button>
          ))}
        </div>
      ) : null}
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
  // ripple / candle flicker 같은 CSS 애니메이션이 리셋되지 않게 한다.
  // 씬 파일은 append-only이므로 기존 beat의 인덱스는 렌더 간에 고정된다.
  const out: ReactElement[] = [];
  let i = 0;
  let lastSpeaker: string | null = null;
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
      case "presence": {
        const collapsed = lastSpeaker === b.name;
        out.push(
          <PresenceBeat
            key={id}
            stage={stage}
            beat={b}
            id={id}
            collapsed={collapsed}
          />,
        );
        lastSpeaker = b.name;
        break;
      }
      case "illustration":
        out.push(<IllustrationBeat key={id} stage={stage} beat={b} id={id} />);
        // 일러스트는 발화 흐름을 끊지 않으므로 lastSpeaker 유지
        break;
      case "whisper":
        out.push(<WhisperBeat key={id} stage={stage} beat={b} id={id} />);
        lastSpeaker = null;
        break;
      case "direction":
        out.push(<DirectionBeat key={id} beat={b} id={id} />);
        lastSpeaker = null;
        break;
      case "divider":
        out.push(<DividerBeat key={id} id={id} />);
        lastSpeaker = null;
        break;
    }
    i++;
  }
  return out;
}

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
        {showEmpty ? (
          <EmptyState stage={stage} actions={actions} />
        ) : (
          renderBeats(beats, stage, actions)
        )}
      </div>
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

export function theme(_snapshot: Agentchan.RendererSnapshot): RendererTheme {
  return RP_THEME;
}
