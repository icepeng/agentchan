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

## 워크플로우: 신규 생성

1. `ls("files")`로 프로젝트 파일 구조를 파악
2. 대표 파일 2~3개를 `read`하여 내용과 frontmatter 확인
3. 탐지 휴리스틱으로 렌더링 유형 결정 (아래 참조)
4. `read("skills/build-renderer/references/renderer-patterns.md")`로 해당 패턴 참조
5. 패턴을 참고하여 프로젝트에 맞는 renderer.ts 생성
6. `write("renderer.ts", code)`로 프로젝트 루트에 저장
7. 사용자에게 생성된 렌더러의 구조와 특징을 설명

## 워크플로우: 기존 수정

1. `read("renderer.ts")`로 현재 렌더러 코드 확인
2. 사용자 요청 파악 (색상 변경, 레이아웃 수정, 새 요소 추가 등)
3. 변경 범위가 작으면 `edit`, 전면 개편이면 `write`

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
