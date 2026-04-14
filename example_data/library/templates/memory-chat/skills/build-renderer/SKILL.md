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

renderer.ts는 외부 import 없이 단일 파일로 작성한다. 모든 타입을 파일 상단에 인라인 선언한다.

```typescript
interface TextFile { type: "text"; path: string; content: string; frontmatter: Record<string, unknown> | null; modifiedAt: number; }
interface BinaryFile { type: "binary"; path: string; modifiedAt: number; }
type ProjectFile = TextFile | BinaryFile;
interface RenderContext { files: ProjectFile[]; baseUrl: string; }

export function render(ctx: RenderContext): string {
  // ctx.files에서 콘텐츠를 읽고, ctx.baseUrl로 에셋 URL을 구성하여 HTML 문자열 반환
}
```

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

### 색상 — `theme` export로 전역 오버라이드 (선택)

`renderer.ts`에서 `export const theme`을 선언하면 프로젝트 페이지 한정으로 전역 CSS 변수를 오버라이드한다. Sidebar / AgentPanel / BottomInput까지 작품의 톤에 함께 물든다. 선언하지 않으면 기본 Obsidian Teal 팔레트를 상속하므로 기존 렌더러는 수정 불필요.

토큰 → CSS 변수 매핑:

| 토큰 | CSS 변수 | 용도 |
| --- | --- | --- |
| `background` | `--color-void` | 앱 최상위 배경 (렌더러 콘텐츠 바깥 픽셀 포함) |
| `surface` | `--color-base` | Sidebar / AgentPanel / BottomInput 베이스 |
| `elevated` | `--color-surface` | 카드 / 인풋 박스 배경 |
| `raised` | `--color-elevated` | hover / 강조 상태 |
| `accent` | `--color-accent` | 포인트 색 |
| `foreground` | `--color-fg` | 본문 텍스트 |
| `foregroundMuted` | `--color-fg-3` | 부드러운 텍스트 |
| `border` | `--color-edge` | 테두리 베이스 (opacity와 조합) |

```typescript
export const theme = {
  base: {
    background: "#f4ecd8",
    surface:    "#e8dcc8",
    accent:     "#8b4513",
    foreground: "#3a2817",
    border:     "#8b4513",
  },
  // 듀얼 모드: dark에서 차이 나는 토큰만 선언. 생략하면 단일 모드(base만 사용).
  dark: {
    background: "#1a1209",
    surface:    "#2a1f14",
    accent:     "#d4a574",
    foreground: "#e8dcc8",
  },
  // 단일 모드에서 사용자 Appearance 토글과 무관하게 모드 고정이 필요하면 명시:
  // prefersScheme: "light",
};
```

- `base`만 있으면 단일 모드 — 사용자 scheme과 무관하게 base 값이 사용됨. 토글 자체를 가리려면 `prefersScheme`을 함께 선언.
- 색상 값은 hex/rgb/hsl 등 CSS가 이해하는 어떤 문자열이든 가능.
- render() 내부에선 평소처럼 `var(--color-accent)` / `var(--color-surface)` 등을 쓴다 — theme이 뒤에서 값을 바꿔준다:

```css
.bubble { background: color-mix(in srgb, var(--color-accent) 8%, transparent); }
.card   { background: var(--color-surface); border: 1px solid color-mix(in srgb, var(--color-edge) 10%, transparent); }
.muted  { color: var(--color-fg-3); }
```

톤 선택 예시: 따스한 sepia(편지·일기), 차가운 네온(사이버펑크), 하이콘트라스트 모노(누아르), 파스텔(게임 UI). 지배 색 하나 + 날카로운 accent가 균등 분배보다 강한 인상을 준다.

### 폰트 — 렌더러 자체 `<style>`에서 직접 지정

폰트는 theme에 포함하지 않는다. 사이드바/설정 등 앱 크롬의 한국어·이모지 가독성을 지키기 위해 폰트 override는 **렌더러 영역 안으로만 한정**한다. 렌더러의 `<style>` 안에서 클래스 셀렉터로 직접 선언한다:

```css
.rb-prose { font-family: 'EB Garamond', Georgia, serif; }
.rb-meta  { font-family: var(--font-family-mono); }   /* 기본 폰트 그대로 상속도 OK */
```

웹폰트가 필요하면 `<style>` 안에서 `@import url('https://fonts.googleapis.com/...')` 혹은 `@font-face`로 로드한다.

### 공간 소유 — viewport edge-to-edge

렌더러는 `RenderedView`가 비워둔 viewport 영역 **전체**를 가진다. 바깥 패딩 없음. 풀블리드 배경·그라디언트·헤로 이미지가 그대로 viewport 끝까지 도달한다. 필요한 간격/정렬은 렌더러 자체 `<style>`에서 책임진다.

```css
/* 읽기 중심 레이아웃: 좁은 measure + 중앙정렬 + 자체 패딩 */
.rb-root { max-width: 680px; margin: 0 auto; padding: 24px 20px; }

/* 풀블리드 배경 + 내부 콘텐츠는 containment */
.rb-root { background: radial-gradient(...); min-height: 100%; }
.rb-content { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
```

대화형 렌더러는 보통 `min-height: 100%; display: flex; flex-direction: column; justify-content: flex-end` 패턴으로 viewport 하단부터 메시지가 쌓이게 한다.

### 그 외

- 이미지 URL: `${ctx.baseUrl}/files/${경로}` (확장자 없이도 서버가 탐색).
- 렌더러는 자체 `<style>` 포함 필수. 사용자 콘텐츠에 escapeHtml 필수. document/window 등 DOM API 사용 금지.

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
