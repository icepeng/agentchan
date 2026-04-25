# agentchan

## 용어
- Codex: 이 저장소를 수정하는 코딩 에이전트.
- Agentchan: 이 저장소가 구현하는 제품과 런타임.
- Agentchan agent: `packages/creative-agent`가 실행하는 제품 내부 에이전트.
- Agentchan skill: Agentchan 프로젝트/템플릿의 `skills/*/SKILL.md`.
- 이 문서의 지시는 Codex에게 적용된다. Agentchan 런타임 규칙은 제품 코드를 수정할 때 보존해야 할 계약으로 읽는다.

## Codex 작업 원칙
- 작업 전 관련 코드를 먼저 읽고 기존 패턴과 경계를 확인한다.
- 구현 전제가 바뀌면 낡은 전제를 보존하는 레이어를 쌓지 말고, 해당 코드를 삭제·단순화해 새 전제에 맞춘다.
- 코드는 적게 쓰고 삭제하기 쉽게 작성한다. 추상화는 실제 중복·경계·테스트 문제를 줄일 때만 추가한다.
- 요청 범위 밖의 변경은 피하되, 범위 안에서는 낡은 구조를 우회하지 않는다.
- 완료 전 diff를 자체 검토해 버그, 회귀, 누락된 검증, 지침 위반을 확인한다.
- 검증을 실행하지 못하면 이유와 대체 확인 방법을 최종 응답에 남긴다.
- 같은 지적이나 반복 작업이 두 번 이상 나오면 Codex 지침, Codex Skill, 또는 Agentchan 지침 개선을 제안한다.
- 사용자 응답, 문서, PR 설명은 한국어로 작성한다.

## 주요 명령
- `bun install` - Bun workspaces 의존성 설치
- `bun run dev` - Web UI dev server 실행. portless 기본 URL은 `https://agentchan.localhost`
- `SERVER_PORT=3001 CLIENT_PORT=4101 bun run --cwd apps/webui dev:local` - portless 없이 수동 포트 실행
- `bun run build` - Turbo production build
- `bunx tsc --noEmit` - 타입 체크. `npx tsc`는 사용하지 않는다.
- `bun run lint` - 전체 ESLint
- `bun run test` - 기본 테스트. 실질 범위는 `packages/creative-agent`의 tools 테스트 중심이다.
- `cd packages/creative-agent && bun test tests/<dir>` - 개별 테스트
- `bun run skills:check` / `bun run skills:sync` - `.agents/skills`와 `.claude/skills` 드리프트 검사/동기화

## 검증 기준
- 변경 범위에 맞는 가장 좁은 테스트부터 실행한다.
- Web UI 변경은 i18n 키, Feature-Sliced import 경계, client runtime import, renderer sandbox 계약을 확인한다.
- Agentchan agent/session/tool 변경은 JSONL 호환성, abort/streaming 동작, tool description과 system prompt의 역할 분리를 확인한다.
- Agentchan agent/session/tool 변경은 기본 테스트 밖의 `tests/session/`, `tests/workspace/`, `tests/slash/`, `tests/slug.test.ts` 필요 여부를 확인한다.
- Renderer 변경은 빌드, sandbox 계약, 런타임 import 가능성, theme export를 확인한다.
- 리뷰 요청을 받으면 findings를 먼저 쓰고, 실제 버그·회귀 위험·누락된 검증·아키텍처 경계 위반만 보고한다.

## 저장소 구조
- `packages/creative-agent` - Agentchan agent orchestration, tools, skills, session/tree, workspace scan, renderer bundling
- `packages/estimate-tokens` - token estimation utilities. `.mjs` + `.d.ts`, 빌드 없음
- `packages/grep` - pure ripgrep-style search package
- `apps/webui` - React 19 + Hono + Vite + Tailwind v4 Web UI
- `example_data/` - 템플릿과 샘플 콘텐츠의 source of truth
- `apps/webui/data/` - runtime copy이며 gitignored. 템플릿/샘플 수정 위치로 쓰지 않는다.

## 공통 아키텍처 경계
- 오래 유지할 설계 결정은 `docs/adr/`를 우선 확인한다.
- Server는 Route -> Service -> Repository 3-layer 구조를 유지한다.
- Route는 Hono `Context` DI로 service를 받고, 경로 상수나 repo를 직접 import하지 않는다.
- Service와 repository는 팩토리 함수로 만들고, 타입은 `ReturnType<typeof createXxxService>` 패턴을 따른다.
- Client는 Feature-Sliced Design을 따른다: `app -> pages -> features -> entities -> shared`.
- 모듈 간 import는 public `index.ts`와 `@/client/...` 절대 경로를 사용한다.
- 모듈 내부에서만 `./` 상대 경로를 사용한다.
- `shared`는 순수 UI/유틸 영역이며 domain context에 의존하지 않는다.
- `@agentchan/creative-agent`는 client에서 `import type`만 허용한다.
- Server/client 양쪽에서 쓰는 순수 유틸리티는 별도 패키지로 분리한다. `.mjs` + `.d.ts`만으로 충분하면 빌드 스텝을 만들지 않는다.

## Web UI 규칙
- 사용자 노출 텍스트는 `t("key")`를 사용한다.
- i18n 키를 추가하면 `i18n/en.ts`와 `i18n/ko.ts`를 함께 갱신한다.
- `localStorage`는 `shared/storage.ts`의 `localStore` 레지스트리만 사용한다.
- Routing은 `currentPage` 기반이며 react-router를 도입하지 않는다.
- ViewMode는 `"chat" | "edit"`이고 `UIContext`에서 관리한다.
- Cross-domain orchestration은 features hook에서 처리한다.
- React Compiler가 켜져 있으므로 성능 목적의 `useMemo`/`useCallback`/`React.memo`를 습관적으로 추가하지 않는다.

## Renderer 규칙
- Renderer contract 상세는 `docs/adr/0001-renderer-primary-surface-react-contract.md`를 따른다.
- Renderer entrypoint는 `renderer/index.tsx`이고 default React component를 export한다.
- Renderer props는 `Agentchan.RendererProps`를 사용한다.
- Renderer imports는 `agentchan:renderer/v1`, `react`, `renderer/` 내부 relative import, 해당 그래프의 CSS import만 허용한다.
- Vendored browser library는 `renderer/` 아래에 둔다.
- Renderer는 `snapshot`과 `actions.send()` / `actions.fill()`만 사용한다.
- Renderer에서 Agentchan skills, `SYSTEM.md`, sessions, host DOM, parent/top window, browser storage, arbitrary URL, npm package, `node:*`에 접근하지 않는다.
- 파일 URL은 `Agentchan.fileUrl(snapshot, fileOrPath)`를 우선 사용한다.
- Renderer owns viewport. `RenderedView`가 외부 padding을 넣는다고 가정하지 않는다.
- 한국어 가능성이 있는 영역에는 monospace 폰트를 사용하지 않는다.

## Agentchan 런타임 규칙
- Agentchan tool LLM 가이드는 2층으로 둔다: system prompt는 선택 규칙, tool `description`은 사용법.
- Streaming 변경 시 request abort signal이 `Agent.abort()`에 연결되는지 확인한다.
- JSONL/session 변경은 기존 로그 호환성을 깨지 않는지 확인한다.
- Tool 변경은 abort/streaming 동작, description 역할, 기본 테스트 밖의 session/workspace/slash 회귀를 함께 확인한다.
- Tree tool은 세션 시작 시 프로젝트 구조 파악용이다. 과거 `ls` tool은 되살리지 않는다.
- Custom provider 변경 시 서버 타입과 클라이언트 타입 미러링을 함께 확인한다.
- Custom provider reasoning은 Agent `options.reasoning`과 model 객체 `reasoning: true`가 모두 필요하다.
- Meta session은 renderer 빌드 같은 프로젝트 구성 작업 전용이다. creative session과 tool/skill 노출을 섞지 않는다.

## Agentchan 프로젝트/템플릿 규칙
- 프로젝트 폴더명이 slug의 단일 원천이다. `_project.json`에는 slug 필드를 추가하지 않는다.
- 초기 "General" 프로젝트 자동 생성은 없다. 프로젝트 0개 상태가 정상이다.
- Template repo에서 README가 없는 디렉터리는 preset으로 취급하지 않는다.
- Template -> Project 복사는 선택한 템플릿 루트 엔트리를 모두 복사해야 한다. 새 루트 파일 추가 시 allowlist를 만들지 않는다.
- Cover image 인식은 프로젝트/템플릿 루트의 `COVER.*`와 `probeCover()` 흐름을 따른다.
- `example_data/`를 수정한 뒤 runtime 반영이 필요하면 `bash scripts/copy-example-data.sh --force`를 사용한다.
- 기존 프로젝트는 생성 시점의 template snapshot을 가진다. 템플릿 변경이 기존 프로젝트에 자동 반영된다고 가정하지 않는다.

## Agentchan 프롬프트 파일 규칙
- Agentchan의 `SYSTEM.md`, `SYSTEM.meta.md`, `skills/*/SKILL.md`는 제품 런타임에서 LLM에 주입되는 실행 지침이다.
- 작성 시 변천사, deprecation 설명, 설계 합리화, 자기참조 재강조, 중복 guard를 제거한다.
- 문장을 지워도 LLM 행동이 동일하면 제거한다.
- 행동을 바꾸는 제약, 절차, 엣지케이스만 남긴다.

## Agentchan Skill 규칙
- Agentchan skill body는 `activate_skill` tool result에 직접 포함된다.
- Slash command는 user message로 body를 주입한다.
- Agentchan skill `scripts/*.ts`는 self-contained로 유지하고, 스킬 간 helper 공통화를 만들지 않는다.
- 템플릿 skill은 프로젝트 생성 시 복사된다.
- `.agents/skills`가 canonical이고 `.claude/skills`는 `bun run skills:sync`로 맞춘다.

## 빌드/배포 특이사항
- Single executable 변경 시 `src/server/paths.ts`를 경로 해석의 단일 소스로 유지한다.
- Bun compiled binary에서는 `import.meta.dir`을 사용하지 않는다. `dirname(process.execPath)`를 사용한다.
- exe 테스트는 별도 폴더에 복사해 dev 환경과 격리한다.
- dev에서는 script tool이 사용자 `bun`을 spawn하고, exe에서는 `BUN_BE_BUN=1`로 자기 자신을 호출한다.

## Browser Automation
- Web UI 확인이나 브라우저 자동화가 필요하면 `agent-browser`를 사용한다.
- 기본 흐름은 `agent-browser open <url>`, `agent-browser snapshot -i`, `agent-browser click @e1` / `agent-browser fill @e2 "text"` 순서다.
