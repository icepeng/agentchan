---
name: build-renderer
description: "프로젝트의 files/ 구조를 분석하여 renderer.ts를 자동 생성하거나 수정한다."
environment: meta
metadata:
  author: agentchan
  version: "1.0"
---

# 렌더러 빌드

프로젝트의 `files/` 디렉토리 구조와 파일 내용을 분석하여 맞춤형 `renderer.ts`를 생성합니다.

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

- 먼저 `renderer.ts`가 이미 존재하는지 확인: `read("renderer.ts")` 시도
  - 존재하면 기존 코드를 반드시 읽고 이해한 후 진행 (무조건 덮어쓰지 않음)
  - 존재하지 않으면 신규 생성 흐름
- `ls("files")`로 프로젝트 파일 구조를 파악
- 대표 파일 2~3개를 `read`하여 내용과 frontmatter 확인

### 2. 사용자 의도 확인

작성을 시작하기 전에 사용자에게 원하는 스타일을 물어본다:
- 탐지 휴리스틱 결과를 바탕으로 추천 유형을 제시 (예: "캐릭터 파일과 장면 파일이 있어서 채팅형을 추천합니다")
- 색감, 레이아웃, 특수 요소 등 선호사항 확인
- 기존 renderer.ts가 있다면: 전면 재작성 vs 부분 수정 여부 확인

### 3. 작성

- `read("skills/build-renderer/references/renderer-patterns.md")`로 해당 패턴 참조
- 패턴을 참고하여 프로젝트에 맞는 renderer.ts 생성
- `write("renderer.ts", code)`로 프로젝트 루트에 저장
- 기존 수정 시: 변경 범위가 작으면 `edit`, 전면 개편이면 `write`

### 4. 검증

- `validate-renderer` 도구를 호출하여 transpile + 실행 검증
- 실패 시: 에러 메시지(transpile/export/runtime 단계 구분)를 분석하고 자동으로 수정 → 다시 `validate-renderer` -- 성공할 때까지 반복
- 성공 시: 반환된 HTML을 검토하여 구조가 의도대로인지 확인
- 사용자에게 좌측 패널의 최종 시각 결과를 확인해달라고 요청

## 탐지 휴리스틱

| 신호 | 유형 | 패턴 |
|------|------|------|
| `scenes/` 디렉토리 + `characters/` 디렉토리 | 채팅형 | 패턴 A |
| frontmatter에 `display-name`, `avatar-image` | 채팅형 | 패턴 A |
| 콘텐츠에 `**이름:**` 대화 패턴 또는 `> ` 사용자 입력 | 채팅형 | 패턴 A |
| `chapters/` + `outline.md` 등 장문 콘텐츠 | 문서형 | 패턴 B |
| 파일에 frontmatter 없음, 단순 텍스트 | 단순형 | 패턴 C |
| 위 어디에도 해당 안 됨 | 커스텀 | 파일 구조 분석 후 자유롭게 설계 |

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
- `data-chat-anchor` -- 채팅형일 때 자동 스크롤 지원
- 이미지 onerror -- `onerror="this.style.display='none'"` 등으로 깨진 이미지 처리
