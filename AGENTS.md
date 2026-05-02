# agentchan

## 대상

이 문서의 지시는 Builder Agent(Codex, Claude Code 등 이 저장소를 수정하는 개발용 에이전트)에게 적용된다.

용어 관련 질문은 [./CONTEXT.md](./CONTEXT.md)를 확인한다.

## 주요 명령

- `bun run dev` - Web UI dev server 실행. portless 기본 URL은 `https://agentchan.localhost`
- `bun run example-data:copy -- --force` - `example_data/`를 `apps/webui/data/` 런타임 데이터로 강제 반영
- `bun run typecheck` - 타입 체크 (tsgo 기반). 주의: `npx tsc`는 사용하지 않는다.
- `bun run test` - 기본 테스트.

## 운영 규칙

- `example_data/`는 템플릿/샘플 콘텐츠의 source of truth다.
- `apps/webui/data/`는 runtime copy이며 gitignored. 템플릿/샘플 수정 위치로 쓰지 않는다.
- 사용자 노출 텍스트는 `t("key")`를 사용한다. i18n 키를 추가하면 `i18n/en.ts`와 `i18n/ko.ts`를 함께 갱신한다.
- React Compiler가 켜져 있으므로 성능 목적의 `useMemo`/`useCallback`/`React.memo`를 습관적으로 추가하지 않는다. 예외는 외부 구독의 안정 key, effect deps 계약, 명시적 캐시 같은 의미적 메모화뿐이다.
- 스킬 파일(`SKILL.md` 등) 편집 시 colored emoji(`❌`, `✅`, `⚠️`, `📁` 같은 글머리 색 강조용 기호)를 쓰지 않는다. 기존 스킬에 있으면 편집 시 함께 제거한다.
- 한국어가 표시되는 UI 영역에서는 `font-style: italic`과 `font-family: monospace`를 typographic 강조 수단으로 사용하지 않는다.
- 사용자 응답, 문서, 이슈, PR (코멘트 포함)은 한국어로 작성한다.
- example_data의 템플릿 편집시 `docs/agents/writing-templates.md`의 규칙을 먼저 읽는다.

## Browser Automation

- Web UI 확인이나 브라우저 자동화가 필요하면 `agent-browser`를 사용한다.
- 기본 흐름은 `agent-browser open <url>`, `agent-browser snapshot -i`, `agent-browser click @e1` / `agent-browser fill @e2 "text"` 순서다.

## Issue tracker

GitHub Issues — `gh` CLI로 `icepeng/agentchan` 저장소를 조작한다. 자세한 명령은 `docs/agents/issue-tracker.md`.

## Triage labels

`docs/agents/triage-labels.md`에 매핑된 Canonical 라벨 5종을 그대로 사용한다.

## Domain docs

Single-context 레이아웃: 루트 `CONTEXT.md` + `docs/adr/`. 소비 규칙은 `docs/agents/domain.md`.
