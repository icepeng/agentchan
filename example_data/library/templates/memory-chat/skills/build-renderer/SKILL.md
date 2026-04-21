---
name: build-renderer
description: "프로젝트의 files/ 구조를 분석하여 renderer/index.ts를 자동 생성하거나 수정한다."
environment: meta
metadata:
  author: agentchan
  version: "2.0"
---

프로젝트의 files/ 구조와 파일 내용을 분석하여 맞춤형 renderer/index.ts를 작성한다.

## 워크플로우

1. renderer/index.ts를 read로 읽고 이해한 후 진행. 없으면 신규 생성
2. SYSTEM.md를 읽어 프로젝트의 목적과 출력 형식을 파악
3. 출력 파일이 있으면 우선으로 읽어 콘텐츠 구조를 이해. 필요하다면 나머지 파일도 읽음
4. 프로젝트 구조를 설명하고 사용자에게 원하는 스타일을 물어본다. 기존 renderer/index.ts 수정 시: 전면 재작성 vs 부분 수정 여부를 사용자에게 확인한다.
5. 사용자가 답변하면, 아래 기법들을 참고하여 renderer/index.ts를 작성 혹은 편집
6. validate-renderer 도구로 transpile + export shape를 검증. 실제 렌더링 결과는 UI에서 사용자가 확인
7. 사용자에게 좌측 패널의 시각 결과 확인 요청

## 격리 모델

렌더러는 same-origin iframe 안에서 실행된다. 호스트는 `<iframe>`만 배치하고, DOM/스크롤/애니메이션/이벤트는 전부 렌더러가 소유한다. 프로젝트 루트의 `renderer/` 폴더가 하나의 독립 웹앱이다.

- `renderer/index.ts` — 엔트리 (필수). `export function mount(container, ctx)` 하나를 반드시 export한다
- `renderer/index.css` — 선택. 서버가 shell `<link>`로 자동 주입
- `renderer/lib/*.js` — vendor 번들(idiomorph 등). 상대 경로로 import: `import { X } from "./lib/x.js"`
- `renderer/*.ts` — 내부 분할 파일(선택). 상대 import 가능

## 계약

renderer/index.ts는 외부 import(npm) 없이 작성한다. 모든 타입을 파일 상단에 인라인 선언한다.

```typescript
interface TextFile { type: "text"; path: string; content: string; frontmatter: Record<string, unknown> | null; modifiedAt: number; }
interface BinaryFile { type: "binary"; path: string; modifiedAt: number; }
type ProjectFile = TextFile | BinaryFile;

// pi-ai 메시지 블록 (canonical shape)
interface TextContent { type: "text"; text: string }
interface ThinkingContent { type: "thinking"; thinking: string }
interface ImageContent { type: "image"; data: string; mimeType: string }
interface ToolCall { type: "toolCall"; id: string; name: string; arguments: Record<string, any> }
type ToolResultContent = (TextContent | ImageContent)[];

interface UserMessage { role: "user"; content: string | (TextContent | ImageContent)[]; timestamp: number }
interface AssistantMessage { role: "assistant"; content: (TextContent | ThinkingContent | ToolCall)[]; provider?: string; model?: string }
interface ToolResultMessage { role: "toolResult"; toolCallId: string; toolName: string; content: ToolResultContent; isError: boolean }
type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

interface AgentState {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}

interface RendererAction { type: "send" | "fill"; text: string; }

interface RendererThemeTokens {
  void?: string; base?: string; surface?: string; elevated?: string; accent?: string;
  fg?: string; fg2?: string; fg3?: string; edge?: string;
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
  baseUrl: string;           // "/api/projects/{slug}"
  assetsUrl: string;         // baseUrl + "/files"
  state: AgentState;
  host: RendererHostApi;
}

interface RendererHandle {
  destroy(): void;
}

export function mount(container: HTMLElement, ctx: MountContext): RendererHandle {
  // 초기 paint → subscribe → listener → destroy로 정리
}
```

`state.messages`는 persisted 대화 기록 + in-flight toolResult까지 합쳐진 한 흐름이다. tool 결과는 `state.messages`에서 `role === "toolResult"`로 찾는다 — 별도 result 필드 없음. tool이 진행 중인지 판단할 때는 `state.pendingToolCalls.has(toolCall.id)`.

## mount 스켈레톤

```typescript
import { Idiomorph } from "./lib/idiomorph.js"; // 애니메이션 지속 필요할 때만

export function mount(container: HTMLElement, ctx: MountContext): RendererHandle {
  let files = ctx.files;
  let scheduled = false;
  let lastHtml = "";

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const html = renderScene({ files, baseUrl: ctx.baseUrl });
      if (html === lastHtml) return;
      lastHtml = html;
      Idiomorph.morph(container, html, { morphStyle: "innerHTML", ignoreActiveValue: true });
    });
  }

  // 초기 paint (morph할 이전 DOM이 없으므로 innerHTML 직접 교체)
  lastHtml = renderScene({ files, baseUrl: ctx.baseUrl });
  container.innerHTML = lastHtml;

  const unsubState = ctx.host.subscribeState(() => schedule());
  const unsubFiles = ctx.host.subscribeFiles((next) => { files = next; schedule(); });

  const onClick = (ev: MouseEvent) => {
    const el = (ev.target as Element | null)?.closest<HTMLElement>("[data-action]");
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
      unsubState();
      unsubFiles();
      container.removeEventListener("click", onClick);
      container.innerHTML = "";
    },
  };
}
```

- `subscribeState`는 매 AgentState 변화마다 호출(rAF로 coalesce 권장). state를 안 쓰는 템플릿은 구독을 생략해도 된다
- `subscribeFiles`는 streaming 종료 시 files가 새로 도착하면 호출. 구독 즉시 현재 files로 1회 push
- `setTheme(theme)`는 프로그래매틱 호출 — files 기반 동적 분기도 `subscribeFiles` 안에서 `ctx.host.setTheme(computedTheme)`로
- `sendAction({ type: "send" | "fill", text })` — `data-action` 속성은 **템플릿 내부 컨벤션**. 호스트는 `sendAction`만 받아 처리

## 자동 스크롤 패턴

iframe 내부 document가 scroll을 소유하므로 `container.ownerDocument.scrollingElement`로 접근.

```typescript
const doc = container.ownerDocument;
const scrollEl = doc.scrollingElement ?? doc.documentElement;
function isNearBottom() {
  return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= 64;
}
function scrollToBottom(behavior: ScrollBehavior) {
  scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior });
}
```

초기 paint 후 `scrollToBottom("auto")`, schedule 루프에서 `wasAtBottom`을 morph 전에 측정 후 true였으면 morph 후 `scrollToBottom("smooth")`.

## Theme 동적 분기

files 내용에 따라 팔레트가 바뀌는 경우(전투/평시 등), `subscribeFiles` 안에서 계산해 `ctx.host.setTheme(theme)`를 호출하면 된다. 호스트가 shallow 비교로 중복 dispatch를 막는다.

```typescript
ctx.host.subscribeFiles((next) => {
  files = next;
  ctx.host.setTheme(computeTheme(files));
  schedule();
});
```

## 스타일링 규칙

CSS 변수 (덮어쓰기 금지): `--color-fg`, `--color-fg-2`, `--color-fg-3`, `--color-fg-4` (텍스트), `--color-accent` (강조), `--color-edge` (테두리), `--color-elevated` (카드 배경), `--font-family-display` (제목 Syne), `--font-family-mono` (코드 Fira Code).

이미지 URL: `${ctx.assetsUrl}/${경로}` 또는 `${ctx.baseUrl}/files/${경로}` (확장자 없이도 서버가 탐색).

사용자 콘텐츠에 escapeHtml 필수. iframe 내부이므로 document/window API는 **자유롭게** 사용 가능 (격리되어 호스트에 영향 없음) — 이전 제약이 풀렸다.

## 디자인 원칙

렌더러를 작성하기 전에 프로젝트의 맥락을 이해하고 명확한 미적 방향을 설정한다. 범용적인 디자인은 피하고, 콘텐츠의 성격에 맞는 의도적인 선택을 한다.

디자인 사고:
- 이 인터페이스의 목적은? 어떤 콘텐츠를 어떤 분위기로 보여줘야 하는가?
- 톤을 선택한다: 미니멀, 에디토리얼, 레트로, 유기적/자연적, 럭셔리, 플레이풀 등. 핵심은 의도성이다.
- 사용자가 기억할 하나의 특징적 요소는 무엇인가?

타이포그래피:
- 제목에 `text-wrap: balance`
- 텍스트 컨테이너에 적절한 max-width와 line-height

색상과 테마:
- CSS 변수로 일관성 유지. 지배적 색상 + 날카로운 악센트가 균등 분배보다 효과적
- `color-mix(in srgb, ...)` 패턴으로 반투명 틴트
- 단조로운 단색 배경보다 그라디언트, 미묘한 텍스처, 레이어드 투명도로 깊이감 연출

공간 구성:
- 요소 간 일관된 간격과 리듬
- 비대칭, 겹침, 여백의 의도적 활용
- flex/grid 레이아웃 활용

모션:
- hover 상태에 시각 피드백 (hover/active/focus가 rest보다 두드러지게)
- transition은 속성 명시 (transition: all 금지). transform/opacity 위주 (compositor-friendly)
- 하나의 잘 조율된 효과가 산발적인 마이크로인터랙션보다 효과적

콘텐츠 대응:
- 긴 텍스트에 truncate/break-words. flex 자식에 min-w-0
- 빈 상태에 안내 메시지. 짧은/평균/긴 입력 모두 대응
- 이미지에 명시적 width/height (CLS 방지), onerror 처리

## 참고 기법

아래는 기존 렌더러에서 사용된 기법들이다. 프로젝트에 맞게 자유롭게 조합하거나 새로운 접근을 설계한다.

### escapeHtml과 기본 마크다운

```typescript
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderBasicMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr />")
    .replace(/\n/g, "<br />");
}
```

### 이미지 URL 구성

```typescript
function resolveImageUrl(ctx: MountContext | { baseUrl: string }, dir: string, imageKey: string): string {
  return `${ctx.baseUrl}/files/${dir}/${imageKey}`;
}
```

### 스트리밍 상태 헬퍼

```typescript
function activeToolCalls(state: AgentState): ToolCall[] {
  return (state.streamingMessage?.content ?? [])
    .filter((b): b is ToolCall => b.type === "toolCall");
}

function findToolResult(state: AgentState, toolCallId: string): ToolResultMessage | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m && m.role === "toolResult" && m.toolCallId === toolCallId) return m;
  }
  return null;
}

function streamingText(state: AgentState): string {
  return (state.streamingMessage?.content ?? [])
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("");
}
```

### 대화 파싱

```typescript
interface ChatLine {
  type: "user" | "character" | "narration" | "divider";
  characterName?: string;
  text: string;
}

function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };
  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };
  const charMatch = trimmed.match(/^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/);
  if (charMatch) return { type: "character", characterName: charMatch[1], text: charMatch[2] };
  return { type: "narration", text: trimmed };
}
```

### frontmatter 기반 캐릭터 매핑

```typescript
interface NameMapEntry { dir: string; avatarImage: string; color?: string; }

function buildNameMap(files: ProjectFile[]): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const file of files) {
    if (file.type !== "text" || !file.frontmatter) continue;
    const fm = file.frontmatter;
    if (!fm["avatar-image"]) continue;
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    const entry: NameMapEntry = { dir, avatarImage: String(fm["avatar-image"]), color: fm.color ? String(fm.color) : undefined };
    for (const raw of String(fm.names ?? "").split(",")) {
      const name = raw.trim();
      if (name && !map.has(name)) map.set(name, entry);
    }
    if (fm["display-name"] && !map.has(String(fm["display-name"]))) map.set(String(fm["display-name"]), entry);
  }
  return map;
}
```

### 인라인 감정 삽화

```typescript
const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;

function formatInline(
  text: string, ctx: { baseUrl: string }, nameMap: Map<string, NameMapEntry>,
): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, '<em class="action">$1</em>');
  html = html.replace(INLINE_IMAGE, (_m, name, key) => {
    const entry = nameMap.get(name);
    const dir = entry?.dir ?? name;
    const url = resolveImageUrl(ctx, dir, key);
    return `<div class="illustration"><img src="${url}" alt="${key}" onerror="this.parentElement.style.display='none'" /></div>`;
  });
  return html;
}
```

### 마크다운 렌더링

```typescript
function renderMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/^---$/gm, "<hr/>");
  html = html.replace(/^&gt;\s*(.*)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/^-\s+(.*)$/gm, "<li>$1</li>");
  const blocks = html.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    if (/^<h[1-6]>|^<hr|^<ul|^<li|^<blockquote/.test(block)) return block;
    return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
}
```
