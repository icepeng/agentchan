---
name: build-renderer
description: "프로젝트의 files/ 구조를 분석하여 renderer.ts를 자동 생성하거나 수정한다."
environment: meta
metadata:
  author: agentchan
  version: "1.0"
---

프로젝트의 files/ 구조와 파일 내용을 분석하여 맞춤형 renderer.ts를 작성한다.

## 워크플로우

1. renderer.ts를 read로 읽고 이해한 후 진행. 없으면 신규 생성
2. SYSTEM.md를 읽어 프로젝트의 목적과 출력 형식을 파악
3. 출력 파일이 있으면 우선으로 읽어 콘텐츠 구조를 이해. 필요하다면 나머지 파일도 읽음
4. 프로젝트 구조를 설명하고 사용자에게 원하는 스타일을 물어본다. 기존 renderer.ts 수정 시: 전면 재작성 vs 부분 수정 여부를 사용자에게 확인한다.
5. 사용자가 답변하면, 아래 기법들을 참고하여 renderer.ts를 작성 혹은 편집
6. validate-renderer 도구로 transpile + 실행 검증. 실패 시 에러를 분석하고 자동 수정 후 재검증
7. 사용자에게 좌측 패널의 시각 결과 확인 요청

## 계약

renderer.ts는 단일 파일로 작성한다. 허용되는 import는 `@agentchan/renderer-runtime` 하나뿐이고, 모든 도메인 타입은 파일 상단에 인라인 선언한다.

```typescript
import { defineRenderer } from "@agentchan/renderer-runtime";

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

// pi AgentState UI subset — AgentPanel과 동일한 인터페이스
interface AgentState {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}

interface RendererActions {
  send(text: string): void;  // 입력창에 채우고 즉시 전송
  fill(text: string): void;  // 입력창에 채우기만
}

interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  state: AgentState;
  actions: RendererActions;
}

function render(ctx: RenderContext): string {
  // ctx.files에서 콘텐츠를 읽고, ctx.baseUrl로 에셋 URL을 구성하여 HTML 문자열 반환
}

export default defineRenderer(render, { /* theme? */ });
```

`state.messages`는 persisted 대화 기록 + in-flight toolResult까지 합쳐진 한 흐름이다. tool 결과는 `state.messages`에서 `role === "toolResult"`로 찾는다 — 별도 result 필드 없음. tool이 진행 중인지 판단할 때는 `state.pendingToolCalls.has(toolCall.id)`.

### 인터랙티브 액션

HTML에 `data-action` + `data-text` 속성을 찍으면 런타임이 클릭을 위임해 처리한다. 인라인 `addEventListener`/`onclick`/`<script>`로 직접 다는 것 대신 이 선언적 경로를 사용한다.

```html
<button data-action="send" data-text="/cast fireball">불기둥</button>
<button data-action="fill" data-text="안녕하세요">인사</button>
```

- `send`: 입력창에 채운 뒤 즉시 전송
- `fill`: 입력창에 채우기만
- `data-text` 생략 시 `textContent` 사용
- 빈 텍스트는 무시, 스트리밍 중 `send`는 자동 무시

프로그래매틱이 필요하면 `ctx.actions.send(text)` / `ctx.actions.fill(text)` 호출.

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

## 스타일링 규칙

CSS 변수 (덮어쓰기 금지): `--color-fg`, `--color-fg-2`, `--color-fg-3`, `--color-fg-4` (텍스트), `--color-accent` (강조), `--color-edge` (테두리), `--color-elevated` (카드 배경), `--font-family-display` (제목 Syne), `--font-family-mono` (코드 Fira Code).
이미지 URL: `${ctx.baseUrl}/files/${경로}` (확장자 없이도 서버가 탐색).
렌더러는 자체 `<style>` 포함 필수. 사용자 콘텐츠에 escapeHtml 필수. document/window 등 DOM API 사용 금지.

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
function resolveImageUrl(ctx: RenderContext, dir: string, imageKey: string): string {
  return `${ctx.baseUrl}/files/${dir}/${imageKey}`;
}
```

### 스트리밍 상태 헬퍼

`state`는 한 곳에서 모든 진행 정보를 노출한다. 자주 쓰이는 추출 패턴:

```typescript
// 현재 in-flight assistant message의 toolCall 블록 (시간순)
function activeToolCalls(state: AgentState): ToolCall[] {
  return (state.streamingMessage?.content ?? [])
    .filter((b): b is ToolCall => b.type === "toolCall");
}

// 가장 최근에 도착한 ToolResultMessage를 messages에서 찾는다
function findToolResult(state: AgentState, toolCallId: string): ToolResultMessage | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m && m.role === "toolResult" && m.toolCallId === toolCallId) return m;
  }
  return null;
}

// in-flight assistant text 모음 — pending 카드 미리보기 등에 사용
function streamingText(state: AgentState): string {
  return (state.streamingMessage?.content ?? [])
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("");
}
```

### 대화 파싱

줄 단위 파싱으로 대화, 사용자 입력, 나레이션 등을 구분한다.

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

동일 타입/캐릭터의 연속 라인을 그룹으로 묶으면 하나의 말풍선으로 렌더링할 수 있다.

### frontmatter 기반 캐릭터 매핑

frontmatter의 avatar-image, names(쉼표 구분), display-name, color 필드로 캐릭터를 식별하고 아바타 이미지를 resolve한다.

```typescript
interface NameMapEntry { dir: string; avatarImage: string; color?: string; }

function buildNameMap(ctx: RenderContext): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const file of ctx.files) {
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

텍스트 안의 `[name:image-key]` 토큰을 감지하여 삽화 이미지로 치환한다. nameMap으로 캐릭터 디렉토리를 resolve한다.

```typescript
const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;

function formatInline(
  text: string, ctx: RenderContext, nameMap: Map<string, NameMapEntry>,
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

입력: `*미소를 짓는다* [elara:smile] "반갑습니다"` → italic + 삽화 이미지 + 텍스트

### 마크다운 렌더링

heading, blockquote, list 등을 변환하고 단락을 분리한다.

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
