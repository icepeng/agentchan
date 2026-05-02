# agentchan

## 용어

- **Builder Agent**: 이 저장소를 수정하는 Codex, Claude Code 등의 개발용 에이전트(=이 문서의 청자).
- **Creative agent**: `packages/creative-agent`가 실행하는 제품 내부 에이전트. 도메인 어휘는 CONTEXT.md → Creative Agent 영역.

이 문서의 지시는 Builder Agent에게 적용된다. 도메인 결정은 `docs/adr/`, 도메인 어휘는 [./CONTEXT.md](./CONTEXT.md)를 우선 확인한다.

## 주요 명령

- `bun run dev` - Web UI dev server 실행. portless 기본 URL은 `https://agentchan.localhost`
- `SERVER_PORT=3001 CLIENT_PORT=4101 bun run --cwd apps/webui dev:local` - portless 없이 수동 포트 실행
- `bun run example-data:copy -- --force` - `example_data/`를 `apps/webui/data/` 런타임 데이터로 강제 반영
- `bun run typecheck` - 타입 체크 (tsgo 기반). 주의: `npx tsc`는 사용하지 않는다.
- `bun run test` - 기본 테스트.
- `cd packages/creative-agent && bun test tests/<dir>` - 개별 테스트

## 저장소 위치 규약

- `example_data/`는 템플릿/샘플 콘텐츠의 source of truth다.
- `apps/webui/data/`는 runtime copy이며 gitignored. 템플릿/샘플 수정 위치로 쓰지 않는다.

## Web UI 운영 규칙

- 사용자 노출 텍스트는 `t("key")`를 사용한다. i18n 키를 추가하면 `i18n/en.ts`와 `i18n/ko.ts`를 함께 갱신한다.
- React Compiler가 켜져 있으므로 성능 목적의 `useMemo`/`useCallback`/`React.memo`를 습관적으로 추가하지 않는다. 예외는 외부 구독의 안정 key, effect deps 계약, 명시적 캐시 같은 의미적 메모화뿐이다.
- `AppEnv`는 `types.ts`에 두고 서비스 타입은 type-only import로 참조해 런타임 순환을 피한다.
- `@agentchan/creative-agent`는 client에서 `import type`만 허용한다. runtime value가 섞이면 Vite dev가 tree-shake하지 않아 barrel 체인의 node API stub으로 앱이 깨지므로, 공유 상수는 서버 DTO로 내려보낸다.

## Creative agent 운영 규칙

- Streaming 변경 시 request abort signal이 `Agent.abort()`에 연결되는지 확인한다.

## 빌드/배포 특이사항

- Single executable 변경 시 `src/server/paths.ts`를 경로 해석의 단일 소스로 유지한다.
- Bun compiled binary에서는 `import.meta.dir`을 사용하지 않는다. `dirname(process.execPath)`를 사용한다.
- Version embedding은 `package.json` JSON import로 처리한다. Bun compiled binary에서 소스 파일 경로가 보존된다고 가정하지 말고, runtime `readFile`로 repo-root `package.json`을 읽지 않는다.
- Single executable 산출물은 `agentchan.exe`와 sidecar `public/`, `data/` 구조를 전제로 한다.

## Browser Automation

- Web UI 확인이나 브라우저 자동화가 필요하면 `agent-browser`를 사용한다.
- 기본 흐름은 `agent-browser open <url>`, `agent-browser snapshot -i`, `agent-browser click @e1` / `agent-browser fill @e2 "text"` 순서다.

## Issue tracker

GitHub Issues — `gh` CLI로 `icepeng/agentchan` 저장소를 조작한다. 자세한 명령은 `docs/agents/issue-tracker.md`.

## Triage labels

`docs/agents/triage-labels.md`에 매핑된 Canonical 라벨 5종을 그대로 사용한다.

## Domain docs

Single-context 레이아웃: 루트 `CONTEXT.md` + `docs/adr/`. 소비 규칙은 `docs/agents/domain.md`.

## 운영 규칙

- 스킬 파일(`SKILL.md` 등)에는 colored emoji(`❌`, `✅`, `⚠️`, `📁` 같은 글머리 색 강조용 기호)를 쓰지 않는다. 새로 작성할 때 추가하지 않고, 기존 스킬에 있으면 편집 시 함께 제거한다.
- 한국어가 표시되는 UI 영역에서는 `font-style: italic`과 `font-family: monospace`를 typographic 강조 수단으로 사용하지 않는다.
- 사용자 응답, 문서, PR 설명은 한국어로 작성한다.
- example_data의 템플릿 편집시 `docs/agents/writing-templates.md`의 규칙을 먼저 읽는다.
