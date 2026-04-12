---
name: build-renderer
description: "프로젝트의 files/ 구조를 분석하여 renderer.ts를 자동 생성하거나 수정한다."
environment: meta
metadata:
  author: agentchan
  version: "1.0"
---

# 렌더러 빌드

프로젝트의 files/ 구조와 파일 내용을 분석하여 맞춤형 renderer.ts를 생성한다.

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

## 워크플로우

1. renderer.ts가 이미 존재하면 read로 읽고 이해한 후 진행. 없으면 신규 생성
2. ls("files")로 파일 구조 파악, 대표 파일 2~3개를 read하여 frontmatter/콘텐츠 확인
3. 탐지 결과를 바탕으로 추천 유형을 제시하고, 사용자에게 원하는 스타일을 물어본다
4. 아래 패턴을 참고하여 renderer.ts 작성
5. validate-renderer 도구로 transpile + 실행 검증. 실패 시 에러를 분석하고 자동 수정 후 재검증
6. 사용자에게 좌측 패널의 시각 결과 확인 요청

기존 renderer.ts 수정 시: 전면 재작성 vs 부분 수정 여부를 사용자에게 확인. 부분 수정이면 edit, 전면이면 write.

## 탐지 휴리스틱

- scenes/ + characters/ 디렉토리, frontmatter에 display-name/avatar-image, 콘텐츠에 `**이름:**` 대화 패턴 → 채팅형
- chapters/ + outline.md 등 장문 콘텐츠 → 문서형
- frontmatter 없는 단순 텍스트 → 단순형
- 해당 없음 → 커스텀 (자유 설계)

## 공통 헬퍼

```typescript
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function resolveImageUrl(ctx: RenderContext, dir: string, imageKey: string): string {
  return `${ctx.baseUrl}/files/${dir}/${imageKey}`;
}

function renderBasicMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr />")
    .replace(/\n/g, "<br />");
}
```

## 채팅형 패턴

캐릭터 대화, 사용자 입력, 나레이션을 말풍선으로 표시.

파싱: scenes/ 안의 텍스트 파일을 줄 단위로 파싱. `---` → divider, `> 텍스트` → user, `**이름:** 텍스트` → character, 그 외 → narration. 동일 타입/캐릭터의 연속 라인을 그룹으로 묶어 하나의 말풍선으로 렌더링.

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

캐릭터 이름 → 아바타 매핑: frontmatter의 avatar-image, names(쉼표 구분), display-name, color 필드로 캐릭터를 식별. `${ctx.baseUrl}/files/${dir}/${avatarImage}`로 이미지 URL 구성.

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

CSS: 캐릭터 말풍선은 `--c` CSS 변수로 색상 주입. 사용자 말풍선은 우측 정렬 + accent. 나레이션은 이탤릭 + 좌측 보더. 루트 div 끝에 `<div data-chat-anchor></div>` 추가.

```css
.cr-char { position: relative; margin-bottom: 24px; }
.cr-bubble { padding: 12px 16px; border-radius: 2px 16px 16px 16px;
  background: color-mix(in srgb, var(--c) 3%, transparent);
  border-left: 2px solid color-mix(in srgb, var(--c) 12%, transparent); }
.cr-user { display: flex; justify-content: flex-end; margin-bottom: 24px; }
.cr-user-bubble { max-width: 72%; padding: 10px 16px; border-radius: 16px 16px 4px 16px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 10%, transparent);
  background: color-mix(in srgb, var(--color-accent) 3%, transparent); }
.cr-narr { margin: 20px 0; padding: 10px 20px 10px 16px;
  border-left: 1px solid color-mix(in srgb, var(--color-edge) 6%, transparent); }
.cr-narr-text { font-style: italic; color: var(--color-fg-2); }
.cr-avatar-img { width: 48px; height: 48px; border-radius: 14px; object-fit: cover; }
```

## 문서형 패턴

소설 챕터, 아웃라인, 세계관을 탭 네비게이션으로 분류 표시.

파일 분류: 경로에 characters → character, world/세계관 → world, outline/아웃라인 → outline, 나머지 → novel.

탭: CSS-only 라디오 버튼. `<input type="radio" name="tab" id="tab-novel" checked>` + `<label>` + `#tab-novel:checked ~ #content-novel { display: block }`.

마크다운 렌더링: escapeHtml 후 heading(h1-h3), bold/italic, blockquote, list, hr 변환. `\n\n`으로 단락 분리, 블록 요소가 아니면 `<p>` 래핑.

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

## 단순형 패턴

frontmatter가 없는 텍스트 파일을 경로순으로 표시. 파일 간 구분선. 빈 상태 메시지 포함.

## 스타일링 규칙

CSS 변수: `--color-fg`, `--color-fg-2`, `--color-fg-3`, `--color-fg-4` (텍스트), `--color-accent` (강조 teal), `--color-edge` (테두리), `--color-elevated` (카드 배경), `--font-family-display` (제목 Syne), `--font-family-mono` (코드 Fira Code).

반투명 틴트: `color-mix(in srgb, var(--color-accent) 10%, transparent)`. 클래스 네이밍: 2글자 프리픽스 (cr-, nr- 등). 이미지 URL: `${ctx.baseUrl}/files/${경로}` (확장자 없이도 서버가 탐색). 이미지에 `onerror="this.style.display='none'"`. 렌더러는 자체 `<style>` 포함 필수. 빈 상태 메시지 필수. 사용자 콘텐츠에 escapeHtml 필수. document/window 등 DOM API 사용 금지.
