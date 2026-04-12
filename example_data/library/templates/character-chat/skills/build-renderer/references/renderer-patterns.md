# Renderer Patterns Reference

renderer.ts 작성 시 참고하는 핵심 패턴 모음. 모든 코드는 외부 import 없이 단일 파일에 작성한다.

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

## 3. 패턴 A: 채팅 렌더러

캐릭터 대화, 사용자 입력, 나레이션을 말풍선 형태로 표시.

### 타입

```typescript
interface ChatLine {
  type: "user" | "character" | "narration" | "divider";
  characterName?: string;
  text: string;
}

interface ChatGroup {
  type: ChatLine["type"];
  characterName?: string;
  lines: string[];
}
```

### 캐릭터 이름 → 아바타 매핑

frontmatter에서 `avatar-image`, `names`, `display-name`, `color` 필드를 읽어 캐릭터를 식별:

```typescript
interface NameMapEntry {
  dir: string;          // 캐릭터 파일의 디렉토리 경로
  avatarImage: string;  // 아바타 이미지 키
  color?: string;
}

function buildNameMap(ctx: RenderContext): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const file of ctx.files) {
    if (file.type !== "text" || !file.frontmatter) continue;
    const fm = file.frontmatter;
    if (!fm["avatar-image"]) continue;
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    const entry: NameMapEntry = { dir, avatarImage: String(fm["avatar-image"]), color: fm.color ? String(fm.color) : undefined };
    // 여러 이름을 매핑 (names 쉼표 구분, display-name, name)
    for (const raw of String(fm.names ?? "").split(",")) {
      const name = raw.trim();
      if (name && !map.has(name)) map.set(name, entry);
    }
    if (fm["display-name"] && !map.has(String(fm["display-name"]))) map.set(String(fm["display-name"]), entry);
    if (fm.name && !map.has(String(fm.name))) map.set(String(fm.name), entry);
  }
  return map;
}
```

### 대화 파싱

```typescript
function parseLine(raw: string): ChatLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "---") return { type: "divider", text: "" };
  // 사용자 입력: > 로 시작
  const userMatch = trimmed.match(/^>\s+(.+)$/);
  if (userMatch) return { type: "user", text: userMatch[1] };
  // 캐릭터 대사: **이름:** 또는 **이름**:
  const charMatch = trimmed.match(/^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/);
  if (charMatch) return { type: "character", characterName: charMatch[1], text: charMatch[2] };
  // 나레이션 (기본)
  return { type: "narration", text: trimmed };
}
```

### 라인 그루핑

동일 타입/캐릭터의 연속 라인을 하나의 그룹으로 묶어 말풍선 하나로 렌더링:

```typescript
function groupLines(lines: ChatLine[]): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const line of lines) {
    const prev = groups[groups.length - 1];
    if (line.type === "divider") { groups.push({ type: "divider", lines: [] }); continue; }
    if (prev && prev.type === line.type && (line.type !== "character" || prev.characterName === line.characterName)) {
      prev.lines.push(line.text);
    } else {
      groups.push({ type: line.type, characterName: line.characterName, lines: [line.text] });
    }
  }
  return groups;
}
```

### 채팅 CSS 핵심

```css
/* 캐릭터 말풍선 — --c 변수로 색상 주입 */
.cr-char { position: relative; margin-bottom: 24px; }
.cr-bubble { padding: 12px 16px; border-radius: 2px 16px 16px 16px;
  background: color-mix(in srgb, var(--c) 3%, transparent);
  border-left: 2px solid color-mix(in srgb, var(--c) 12%, transparent); }

/* 사용자 — 우측 정렬 */
.cr-user { display: flex; justify-content: flex-end; margin-bottom: 24px; }
.cr-user-bubble { max-width: 72%; padding: 10px 16px; border-radius: 16px 16px 4px 16px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 10%, transparent);
  background: color-mix(in srgb, var(--color-accent) 3%, transparent); }

/* 나레이션 — 이탤릭 + 좌측 보더 */
.cr-narr { margin: 20px 0; padding: 10px 20px 10px 16px;
  border-left: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent); }
.cr-narr-text { font-style: italic; color: var(--color-fg-2); }

/* 아바타 */
.cr-avatar-img { width: 48px; height: 48px; border-radius: 14px; object-fit: cover; }

/* 자동 스크롤 앵커 */
[data-chat-anchor] { }
```

### 채팅 렌더러 구조

```typescript
export function render(ctx: RenderContext): string {
  const nameMap = buildNameMap(ctx);
  const sceneFiles = ctx.files.filter((f): f is TextFile => f.type === "text" && f.path.startsWith("scenes/"));
  if (sceneFiles.length === 0) return STYLES + renderEmpty();
  const allContent = sceneFiles.sort((a, b) => a.path.localeCompare(b.path)).map(f => f.content).join("\n\n---\n\n");
  const parsed = allContent.split("\n").map(parseLine).filter((l): l is ChatLine => l !== null);
  const groups = groupLines(parsed);
  // 각 그룹을 HTML로 렌더링
  const rendered = groups.map(g => { /* switch(g.type) */ }).join("\n");
  return `${STYLES}<div class="cr-root">${rendered}<div data-chat-anchor></div></div>`;
}
```

## 4. 패턴 B: 문서/산문 렌더러

소설 챕터, 아웃라인, 세계관 파일을 탭 네비게이션으로 분류 표시.

### 파일 분류

```typescript
function categorize(path: string): "novel" | "outline" | "world" | "character" {
  if (/characters?[/\\]/i.test(path)) return "character";
  if (/world|세계관/i.test(path)) return "world";
  if (/outline|아웃라인/i.test(path)) return "outline";
  return "novel";
}
```

### CSS-only 탭 시스템

```html
<input type="radio" name="tab" id="tab-novel" checked>
<label for="tab-novel">Novel</label>
<input type="radio" name="tab" id="tab-outline">
<label for="tab-outline">Outline</label>
<!-- ... -->
<div class="tab-content" id="content-novel">...</div>
```

```css
input[type="radio"] { display: none; }
.tab-content { display: none; }
#tab-novel:checked ~ #content-novel { display: block; }
#tab-outline:checked ~ #content-outline { display: block; }
```

### 마크다운 렌더링 (확장)

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
  // 단락 분리
  const blocks = html.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    if (/^<h[1-6]>|^<hr|^<ul|^<li|^<blockquote/.test(block)) return block;
    return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
}
```

## 5. 패턴 C: 단순 렌더러

frontmatter가 없는 텍스트 파일을 순서대로 표시:

```typescript
export function render(ctx: RenderContext): string {
  const contentFiles = ctx.files.filter((f): f is TextFile => f.type === "text" && !f.frontmatter);
  if (contentFiles.length === 0) return `${STYLES}<div class="empty">아직 출력 파일이 없습니다</div>`;
  return STYLES + contentFiles.sort((a, b) => a.path.localeCompare(b.path)).map((file, i) => {
    const sep = i > 0 ? '<hr class="sep" />' : "";
    return `${sep}<div class="path">${escapeHtml(file.path)}</div><div class="body">${renderBasicMarkdown(file.content)}</div>`;
  }).join("\n");
}
```

## 6. 스타일링 컨벤션

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

### 반투명 틴트 패턴

`color-mix(in srgb, var(--color-accent) 10%, transparent)` — 불투명도 조절에 사용.

### 클래스 네이밍

2글자 프리픽스 사용: `cr-` (chat renderer), `nr-` (novel renderer) 등. 전역 충돌 방지.

## 7. 안티패턴

- 외부 모듈 import 금지 (import 문 자체를 쓰지 않음)
- `document`, `window` 등 DOM API 사용 금지 (HTML 문자열만 반환)
- 색상 하드코딩 금지 (CSS 변수 사용)
- 빈 상태 미처리 금지 (파일이 없을 때 메시지 표시)
- 사용자 콘텐츠 미이스케이프 금지 (`escapeHtml` 필수)
- `<style>` 태그 누락 금지 (렌더러는 독립 실행되므로 자체 스타일 포함)
