---
name: build-renderer
description: "프로젝트의 files/ 구조를 분석하여 renderer.ts를 자동 생성하거나 수정한다."
environment: meta
metadata:
  author: agentchan
  version: "1.0"
---

# 렌더러 빌드

프로젝트의 `files/` 디렉토리 구조와 파일 내용을 분석하여 맞춤형 `renderer.ts`를 생성하거나 수정합니다.

먼저 [references/renderer-patterns.md](references/renderer-patterns.md)를 읽으세요.

## 렌더러 계약

renderer.ts는 아래 규칙을 반드시 지켜야 합니다:

1. `export function render(ctx: RenderContext): string` -- HTML 문자열을 반환
2. 모든 타입(RenderContext, ProjectFile 등)을 파일 상단에 inline 선언 -- import 불가
3. 외부 모듈 import 절대 금지 -- import 문 자체를 쓰지 않음
4. `ctx.files`에서 콘텐츠를 읽고, `ctx.baseUrl`로 에셋 URL을 구성

### 인라인 타입 (renderer.ts 상단에 포함)

```typescript
interface TextFile { type: "text"; path: string; content: string; frontmatter: Record<string, unknown> | null; modifiedAt: number; }
interface BinaryFile { type: "binary"; path: string; modifiedAt: number; }
type ProjectFile = TextFile | BinaryFile;
interface RenderContext { files: ProjectFile[]; baseUrl: string; }
```

## 워크플로우

### 1. 현황 파악

- `read("renderer.ts")`로 기존 렌더러가 있는지 확인
- `ls("files")`로 프로젝트 파일 구조를 파악
- 대표 파일 2~3개를 `read`하여 내용과 frontmatter 확인

### 2. 사용자 의도 확인 (필수 -- 이 단계를 건너뛰지 않는다)

코드를 작성하기 전에 반드시 사용자에게 질문한다:

**renderer.ts가 이미 존재하는 경우:**
- 기존 렌더러의 구조와 특징을 요약하여 보여준다
- 어떤 부분을 변경하고 싶은지 물어본다
- 사용자가 명시적으로 전면 재작성을 요청하지 않는 한, 기존 코드를 수정(edit)한다

**renderer.ts가 없는 경우:**
- 파일 구조 분석 결과를 바탕으로 렌더러 방향을 제안한다
- 표현 방식, 색감, 레이아웃 등 선호사항을 확인한다

### 3. 작성

- `read("skills/build-renderer/references/renderer-patterns.md")`로 헬퍼 패턴 참조
- **기존 렌더러 수정**: `edit`으로 변경할 부분만 수정 (기본 동작)
- **신규 생성 또는 전면 재작성** (사용자가 요청한 경우만): `write("renderer.ts", code)`

### 4. 검증

- `validate-renderer` 도구를 호출하여 transpile + 실행 검증
- 실패 시: 에러 메시지(transpile/export/runtime 단계 구분)를 분석하고 자동으로 수정 -> 다시 `validate-renderer` -- 성공할 때까지 반복
- 성공 시: 반환된 HTML을 검토하여 구조가 의도대로인지 확인
- 사용자에게 좌측 패널의 최종 시각 결과를 확인해달라고 요청

## 디자인 가이드

- CSS 변수 사용: `--color-fg`, `--color-fg-2`, `--color-fg-3`, `--color-fg-4`, `--color-accent`, `--color-edge`, `--color-elevated`
- 폰트: `--font-family-display` (제목), `--font-family-mono` (코드)
- 이미지 URL: `${ctx.baseUrl}/files/${경로}` -- 확장자 없이도 서버가 자동 탐색
- 반투명 틴트: `color-mix(in srgb, var(--color-accent) 10%, transparent)`
- 클래스 프리픽스: 2글자 (예: `cr-`, `nr-`) -- 전역 충돌 방지

## 품질 체크리스트

- `escapeHtml()` 헬퍼 포함 -- 사용자 콘텐츠를 반드시 이스케이프
- 빈 상태 메시지 -- 파일이 없을 때 안내 텍스트 표시
- `<style>` 태그 -- 렌더러는 독립 실행되므로 자체 CSS 포함
- 이미지 onerror -- `onerror="this.style.display='none'"` 등으로 깨진 이미지 처리
