# Renderer Toolkit

renderer.ts 작성 시 사용할 수 있는 범용 도구 모음. 모든 코드는 외부 import 없이 단일 파일에 작성한다.

## 1. 필수 타입 보일러플레이트

모든 renderer.ts 파일 상단에 반드시 포함:

```typescript
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
```

## 2. 공통 헬퍼

```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveImageUrl(ctx: RenderContext, dir: string, imageKey: string): string {
  return `${ctx.baseUrl}/files/${dir}/${imageKey}`;
}

function renderBasicMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, '<hr />')
    .replace(/\n/g, "<br />");
}
```

확장 마크다운 (heading, blockquote, list 지원):

```typescript
function renderMarkdown(text: string): string {
  let html = escapeHtml(text).replace(/\r\n/g, "\n");
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

## 3. 파일 접근 패턴

### 텍스트 파일 필터링

```typescript
// frontmatter가 있는 파일 (정의/메타데이터 파일)
const definitionFiles = ctx.files.filter(
  (f): f is TextFile => f.type === "text" && f.frontmatter !== null
);

// frontmatter가 없는 파일 (콘텐츠/출력 파일)
const contentFiles = ctx.files.filter(
  (f): f is TextFile => f.type === "text" && !f.frontmatter
);

// 특정 디렉토리의 파일
const sceneFiles = ctx.files.filter(
  (f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/")
);
```

### frontmatter 활용

파일의 역할은 frontmatter로 판별한다 (duck typing):

```typescript
// frontmatter에서 값 읽기
const displayName = file.frontmatter?.["display-name"];
const avatarImage = file.frontmatter?.["avatar-image"];
const color = file.frontmatter?.color;

// 이름 매핑 (frontmatter의 names, display-name, name 필드 활용)
const names = String(file.frontmatter?.names ?? "").split(",").map(s => s.trim()).filter(Boolean);
```

### 이미지 URL 구성

```typescript
// 파일 경로에서 디렉토리 추출
const dir = file.path.substring(0, file.path.lastIndexOf("/"));
// 이미지 URL — 확장자 없이도 서버가 자동 탐색
const avatarUrl = `${ctx.baseUrl}/files/${dir}/${imageKey}`;
```

## 4. 스타일링

### CSS 변수 (항상 사용)

| 변수 | 용도 |
|------|------|
| `--color-fg` | 기본 텍스트 |
| `--color-fg-2` | 보조 텍스트 |
| `--color-fg-3` | 약한 텍스트 |
| `--color-fg-4` | 가장 약한 텍스트 |
| `--color-accent` | 강조 (teal) |
| `--color-edge` | 테두리 |
| `--color-elevated` | 카드/패널 배경 |
| `--font-family-display` | 제목용 (Syne) |
| `--font-family-mono` | 코드용 (Fira Code) |

### 반투명 틴트

`color-mix(in srgb, var(--color-accent) 10%, transparent)` -- 불투명도 조절에 사용.

### 클래스 네이밍

2글자 프리픽스 사용 (예: `cr-`, `nr-`). 전역 충돌 방지.

### 렌더러 구조 템플릿

```typescript
const STYLES = `<style>
  .xx-root { /* 루트 컨테이너 */ }
  .xx-empty { color: var(--color-fg-4); text-align: center; padding: 48px 0; }
  /* ... */
</style>`;

export function render(ctx: RenderContext): string {
  const files = ctx.files.filter((f): f is TextFile => f.type === "text");
  if (files.length === 0) {
    return `${STYLES}<div class="xx-empty">아직 출력 파일이 없습니다</div>`;
  }
  // ... 렌더링 로직 ...
  return `${STYLES}<div class="xx-root">...</div>`;
}
```

## 5. 안티패턴

- 외부 모듈 import 금지 (import 문 자체를 쓰지 않음)
- `document`, `window` 등 DOM API 사용 금지 (HTML 문자열만 반환)
- 색상 하드코딩 금지 (CSS 변수 사용)
- 빈 상태 미처리 금지 (파일이 없을 때 메시지 표시)
- 사용자 콘텐츠 미이스케이프 금지 (`escapeHtml` 필수)
- `<style>` 태그 누락 금지 (렌더러는 독립 실행되므로 자체 스타일 포함)
