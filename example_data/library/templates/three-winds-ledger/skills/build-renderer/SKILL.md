---
name: build-renderer
description: "프로젝트의 files/ 구조를 분석하여 renderer.tsx를 자동 생성하거나 수정한다."
environment: meta
metadata:
  author: agentchan
  version: "2.0"
---

프로젝트의 files/ 구조와 파일 내용을 분석하여 맞춤형 renderer.tsx를 작성한다.

## 워크플로우

1. renderer.tsx를 read로 읽고 이해한 후 진행. 없으면 신규 생성
2. SYSTEM.md를 읽어 프로젝트의 목적과 출력 형식을 파악
3. 출력 파일이 있으면 우선으로 읽어 콘텐츠 구조를 이해. 필요하다면 나머지 파일도 읽음
4. 프로젝트 구조를 설명하고 사용자에게 원하는 스타일을 물어본다. 기존 renderer.tsx 수정 시: 전면 재작성 vs 부분 수정 여부를 사용자에게 확인한다.
5. 사용자가 답변하면, 아래 기법들을 참고하여 renderer.tsx를 작성 혹은 편집
6. validate-renderer 도구로 transpile + default export 검증. 실패 시 에러를 분석하고 자동 수정 후 재검증
7. 사용자에게 좌측 패널의 시각 결과 확인 요청

## 계약

renderer.tsx는 단일 파일로 작성한다. React 타입만 `import type { ReactElement, ReactNode }`로 가져오고, hook 사용이 필요하면 `import { useState } from "react"`처럼 값 import 가능 (host가 브릿지 처리). 나머지 타입은 파일 상단에 인라인 선언한다.

```tsx
import type { ReactElement } from "react";

interface TextFile { type: "text"; path: string; content: string; frontmatter: Record<string, unknown> | null; modifiedAt: number; }
interface DataFile { type: "data"; path: string; content: string; data: unknown; format: "yaml" | "json"; modifiedAt: number; }
interface BinaryFile { type: "binary"; path: string; modifiedAt: number; }
type ProjectFile = TextFile | DataFile | BinaryFile;

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
  send(text: string): void;                  // 즉시 전송 (스트리밍 중이면 무시)
  fill(text: string): void;                  // 입력창 채움
  setTheme(theme: unknown): void;            // stub, 호출해도 무방
}

interface RendererProps {
  state: AgentState;
  files: ProjectFile[];
  slug: string;
  baseUrl: string;
  actions: RendererActions;
}

export default function Renderer(props: RendererProps): ReactElement {
  // props.files에서 콘텐츠를 읽고, props.baseUrl로 에셋 URL을 구성하여 JSX 반환
  return <div>...</div>;
}
```

`state.messages`는 persisted 대화 기록 + in-flight toolResult까지 합쳐진 한 흐름이다. tool 결과는 `state.messages`에서 `role === "toolResult"`로 찾는다 — 별도 result 필드 없음. tool이 진행 중인지 판단할 때는 `state.pendingToolCalls.has(toolCall.id)`.

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

콘텐츠 대응:
- 긴 텍스트에 truncate/break-words. flex 자식에 min-w-0
- 빈 상태에 안내 메시지. 짧은/평균/긴 입력 모두 대응
- 이미지에 명시적 width/height (CLS 방지), `onError` 핸들러로 fallback

## 스타일링 규칙

CSS 변수 (덮어쓰기 금지): `--color-fg`, `--color-fg-2`, `--color-fg-3`, `--color-fg-4` (텍스트), `--color-accent` (강조), `--color-edge` (테두리), `--color-elevated` (카드 배경), `--font-family-display` (제목 Syne), `--font-family-mono` (코드 Fira Code).
이미지 URL: `${props.baseUrl}/files/${경로}` (확장자 없이도 서버가 탐색).
렌더러는 자체 `<style>{STYLES}</style>` 포함 필수. 렌더러는 Shadow DOM 안에서 실행되므로 host CSS와 충돌하지 않는다.
한국어가 들어갈 가능성이 있는 영역에는 monospace 폰트를 사용하지 않는다.

## 참고 기법

아래는 기존 렌더러에서 사용된 기법들이다. 프로젝트에 맞게 자유롭게 조합하거나 새로운 접근을 설계한다.

### 인라인 스타일과 STYLES 상수

```tsx
const STYLES = `
  .rt-root { max-width: 720px; margin: 0 auto; padding: 24px; color: var(--color-fg); }
  .rt-body { white-space: pre-wrap; line-height: 1.625; font-size: 14px; }
  .rt-sep { margin: 24px 0; border: none; border-top: 1px solid var(--color-edge); }
`;

export default function Renderer(props: RendererProps): ReactElement {
  return (
    <div className="rt-root">
      <style>{STYLES}</style>
      {/* ... */}
    </div>
  );
}
```

### 기본 마크다운을 JSX로

React는 문자열을 자동 escape하므로 수동 escape는 불필요. `**bold**`/`*italic*`은 `(string | ReactElement)[]` 반환으로 처리한다.

```tsx
function renderInline(line: string): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) parts.push(line.slice(cursor, match.index));
    if (match[1] !== undefined) parts.push(<strong key={idx++}>{match[1]}</strong>);
    else if (match[2] !== undefined) parts.push(<em key={idx++}>{match[2]}</em>);
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) parts.push(line.slice(cursor));
  return parts;
}
```

### 이미지 URL 구성 + onError fallback

```tsx
function resolveImageUrl(baseUrl: string, dir: string, imageKey: string): string {
  return `${baseUrl}/files/${dir}/${imageKey}`;
}

// 이미지 실패 시 wrapper 전체 숨김 — React onError 핸들러로 처리
<img
  src={resolveImageUrl(props.baseUrl, dir, key)}
  alt={key}
  onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
/>
```

### Renderer Actions (버튼/선택지)

```tsx
<button onClick={() => props.actions.fill("선택지 텍스트")}>선택지</button>
<button onClick={() => props.actions.send("즉시 전송")}>전송</button>
```

`data-action`/`data-text` 위임은 더 이상 없다. onClick을 직접 바인딩한다.

### 스트리밍 상태 헬퍼

`state`는 한 곳에서 모든 진행 정보를 노출한다. 자주 쓰이는 추출 패턴:

```tsx
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

```tsx
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

동일 타입/캐릭터의 연속 라인을 그룹으로 묶으면 하나의 말풍선 컴포넌트로 렌더링할 수 있다.

### frontmatter 기반 캐릭터 매핑

frontmatter의 avatar-image, names(쉼표 구분), display-name, color 필드로 캐릭터를 식별하고 아바타 이미지를 resolve한다.

```tsx
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

텍스트 안의 `[name:image-key]` 토큰을 감지하여 삽화 이미지로 치환한다.

```tsx
const INLINE_IMAGE = /\[([a-z0-9][a-z0-9-]*):([^\]]+)\]/g;

function formatInline(
  text: string, baseUrl: string, nameMap: Map<string, NameMapEntry>,
): (string | ReactElement)[] {
  const out: (string | ReactElement)[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = INLINE_IMAGE.exec(text)) !== null) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    const [, name, key] = m;
    const entry = nameMap.get(name);
    const dir = entry?.dir ?? name;
    out.push(
      <span key={idx++} className="illustration" style={{ display: "block" }}>
        <img
          src={`${baseUrl}/files/${dir}/${key}`}
          alt={key}
          onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
        />
      </span>,
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
```

입력: `*미소를 짓는다* [elara:smile] "반갑습니다"` → italic + 삽화 이미지 + 텍스트

### 마크다운 블록 렌더링

heading, blockquote, list 등을 union 타입으로 토큰화한 뒤 JSX로 매핑한다.

```tsx
type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "hr" };

function parseMarkdown(text: string): Block[] {
  // 줄 단위 tokenizer — 구현 생략
  return [];
}

function renderBlocks(blocks: Block[]): ReactElement[] {
  return blocks.map((b, i) => {
    switch (b.kind) {
      case "h1": return <h1 key={i}>{b.text}</h1>;
      case "h2": return <h2 key={i}>{b.text}</h2>;
      case "hr": return <hr key={i} />;
      case "paragraph":
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>{renderInline(line)}{j < b.lines.length - 1 ? <br /> : null}</span>
            ))}
          </p>
        );
    }
  });
}
```

### 테마 export (선택)

프로젝트 페이지 한정으로 `--color-*` 전역 팔레트를 오버라이드하고 싶으면 `theme` 함수를 export한다. `files` 기반 동적 테마 가능.

```tsx
export function theme(ctx: { files: ProjectFile[] }) {
  return {
    base: {
      void: "#0a0e0d",
      base: "#0f1514",
      surface: "#141c1b",
      elevated: "#1a2322",
      accent: "#2dd4bf",
      fg: "#e6f0ee",
      fg2: "#a3b8b4",
      fg3: "#6b7f7b",
      edge: "#2a3735",
    },
    prefersScheme: "dark" as const,
  };
}
```
