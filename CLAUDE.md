# agentchan

## Build & Dev
- `bun install` — install dependencies (Bun workspaces)
- `bun run dev` — start dev server (apps/webui) via portless: `https://agentchan.localhost` (worktree에서는 `branch.agentchan.localhost`)
- `bun run dev -- --port 3001` — portless 없이 수동 포트 지정 (server :3001, client :4101)
- `bun run build` — production build via Turbo
- `bunx tsc --noEmit` — type-check (run from `apps/webui/` or `packages/creative-agent/`). Do NOT use `npx tsc`.
- `bun run lint` — ESLint 전체 실행 (Turbo). 에러 방지 규칙만 적용 (포매팅/스타일 규칙 없음)
- `bun run test` — Turbo 전체 테스트. 실질적으로는 `packages/creative-agent`의 `tests/tools/` 도구 단위 테스트(`bun test --filter tests/tools/`). 개별: `cd packages/creative-agent && bun test tests/<dir>`. 세션/워크스페이스/슬래시/슬러그 테스트는 `tests/session/`, `tests/workspace/`, `tests/slash/`, `tests/slug.test.ts`에 존재하나 기본 스크립트 범위 밖 — 별도 호출 필요. LLM 평가는 `bun run eval`(별도 스크립트, `tests/eval/`)

## Dev Server Management (for Claude Code)
- `dev`는 반드시 `run_in_background: true`. `dev.ts`가 자동 정리하므로 수동 종료 불필요
- **Worktree 자동화**: `SessionStart` hook(`scripts/setup-worktree.sh`)이 `example_data/` → `apps/webui/data/` 복사 + portless가 branch 서브도메인 자동 할당(e.g. `fix-ui.agentchan.localhost`)

## Monorepo Structure
- `packages/creative-agent` — Creative agent library (@agentchan/creative-agent): tools (AgentTool), skills, session/tree, orchestration. Built on `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`. Source-first (빌드 없음, `main`/`types`가 `src/index.ts` 직접 참조)
- `packages/estimate-tokens` — Token estimation utilities (@agentchan/estimate-tokens): 순수 .mjs 파일 하나, 빌드 불필요. Server/client 양쪽에서 import 가능
- `packages/grep` — Pure ripgrep-style 파일 검색 (@agentchan/grep): walker + matcher만 제공, 빌드 불필요. `creative-agent`의 grep tool에서 사용
- `apps/webui` — Web UI: React 19 + Hono + Vite + Tailwind v4. Project CRUD, templates, renderer, edit mode

## Web UI Architecture
- **Server**: 3-layer architecture — Route → Service → Repository. Hono Context DI (`c.get()`)로 서비스 주입
- **Client**: Feature-Sliced Design 기반 — `app/ → pages/ → features/ → entities/ → shared/` 레이어 계층
- **Storage**: File-based JSONL in `apps/webui/data/` (gitignored), split into `data/library/templates/` and `data/projects/`
- **Streaming**: SSE (Server-Sent Events) for agent responses
- **Design system**: Obsidian Teal — colors in `src/client/main.css`, fonts: Syne/Lexend/Fira Code
- **Layout**: Split-pane — left: rendered output, right: agent chat (collapsible), bottom: input
- **Routing**: State-based via `currentPage` in `entities/ui/UIContext.tsx` (no react-router). Pages: main, templates, settings
- **ViewMode**: `"chat" | "edit"` — UIContext에서 관리. Edit mode는 AgentPanel 헤더에서 토글
- **Renderer system**: Per-project `renderer/index.ts` — same-origin iframe에 서버가 shell HTML 주입, 렌더러는 `mount(container, ctx)`로 DOM·스크롤·이벤트 소유
- **Templates**: 프로젝트 생성용 프리셋 목록 (`data/library/templates/`). `README.md` frontmatter(name/description) + SYSTEM.md + skills/ + renderer/ + files/. 사용자 지정 순서는 `_order.json`에 저장 (파일시스템이 진실, order는 힌트)
- **Parallel streaming**: 프로젝트 단위 동시 스트리밍. 런타임 상태는 3개 Context로 분해 — `StreamContext`(projectSlug→stream 슬롯 Map), `SessionSelectionContext`(projectSlug→openSessionId + replyToNodeId Map), `RendererViewContext`(현재 보이는 프로젝트의 html/theme singleton). active 여부는 `ProjectSelectionContext.activeProjectSlug`와 조합해 `useActiveStream` 등의 셀렉터가 결정. 서버는 `c.req.raw.signal`을 Agent.abort()에 연결, 탭 닫기/fetch abort 시 정리. 백그라운드 완료 시 Notification API + 탭 타이틀 배지 + Sidebar unseen 인디케이터 (권한 거부 시 graceful fallback)
- **Project Settings**: name/notes 편집 모달. SYSTEM.md/skills/renderer/ 편집은 Edit Mode에서 직접 수행
- **Cover images**: 프로젝트/템플릿 루트의 `COVER.{webp,png,jpg,...}` 파일 자동 인식. `probeCover()` (in `paths.ts`)가 단일 유틸, `hasCover` 필드는 list API에서 computed (disk 미저장). `GET /api/projects/:slug/cover`, `GET /api/templates/:slug/cover` 엔드포인트 제공

## Server Layer Architecture (Route → Service → Repository)
```
routes/              ← HTTP 관심사만: 파싱, 검증, 응답. `new Hono<AppEnv>()` + `c.get("xxxService")`
services/            ← 비즈니스 로직. 팩토리 함수(`createXxxService`)로 의존성 주입, 클로저로 상태 캡슐화
repositories/        ← 순수 데이터 접근 (fs, SQLite, creative-agent). 팩토리 함수(`createXxxRepo`)
index.ts             ← Composition root: repo → service → DI middleware → route 조립
```
- **의존 규칙**: 하향만 (routes→services→repositories). 라우트 간 직접 import 금지
- **DI**: Hono Context (`c.set()`/`c.get()`)로 route에 주입, 팩토리 파라미터로 service↔repo 간 주입
- **타입 패턴**: `export type XxxService = ReturnType<typeof createXxxService>` — 인터페이스 대신 팩토리 반환 타입
- **AppEnv**: `types.ts`에 정의. 모든 서비스 타입을 `type-only import`로 참조 (런타임 순환 없음)
- **네이밍**: `*.routes.ts`, `*.service.ts`, `*.repo.ts` 접미사
- **Template repo**: README가 없는 디렉토리는 `list()`에서 제외됨 (README = 프리셋 존재 마커)

## Client Layer Architecture (FSD-inspired)
```
app/              ← 최상위: UIContext, providers 조합, AppShell, Sidebar
pages/            ← PageRoute 1:1 매핑 (조합만, 로직 없음)
features/         ← 도메인 UI + 오케스트레이션 훅 (chat, project, editor, settings, onboarding, oauth, update)
entities/         ← 도메인 모델 + 상태(Context) + API (project, session, stream, renderer, config, skill, editor, template, ui, update)
                    · project:   `ProjectSelectionContext`(activeProjectSlug)
                    · session:   디스크 엔티티 (JSONL 1개 = 1 session). 트리/노드/API + `SessionSelectionContext`(projectSlug→openSessionId + replyToNodeId)
                    · stream:    `StreamContext` — projectSlug→stream 슬롯 Map
                    · renderer:  `RendererThemeContext`(활성 프로젝트가 host.setTheme으로 내린 팔레트) + `RendererActionContext`(host.sendAction 브릿지) + `useRendererMount`(iframe boot handshake + subscribeState/Files push) + projectTheme 검증/병합 유틸
shared/           ← 순수 UI 컴포넌트 + 유틸리티 (context 접근 금지)
i18n/             ← 다국어 사전 + Context (en.ts/ko.ts + LanguagePreference). `t(key)` 훅으로 사용
```
- **의존 규칙**: 하향만 (app→pages→features→entities→shared). 모듈 경계는 `index.ts`, 외부에서 내부 파일 직접 import 금지
- **import**: 모듈 간 `@/client/...` 절대 경로, 모듈 내 `./` 상대 경로. Entity별 독립 Context (ProjectSelection, SessionSelection, Stream, RendererView, RendererAction, Config, Skill, Editor, UI)
- **`@agentchan/creative-agent`는 client에서 `import type`만**. runtime value 섞이면 Vite dev가 barrel 체인의 node API stub으로 앱 전체 붕괴(dev는 tree-shake 안 함). 공유 상수는 서버 DTO로 내려보낸다
- **Cross-domain 오케스트레이션**: features/ 훅에서 담당 (예: `useProject.deleteProject`가 stream CLOSE + session CLEAR + fallback activateProject까지 묶어 수행. iframe slot 기반이라 렌더러 stale HTML 오염 위험이 없어져 별도 CLEAR 브로드캐스트는 불필요)
- **i18n**: 모든 사용자 노출 텍스트는 `t("key")` 사용. 키 추가 시 `i18n/en.ts`와 `i18n/ko.ts` 동시 갱신
- **Browser storage**: `localStorage`는 **반드시** `shared/storage.ts`의 `localStore` 레지스트리만 사용. 새 키 추가 = `localStore`에 등록 (prefix `agentchan-`, enum 검증, try/catch 자동화). ESLint `no-restricted-syntax`로 `localStorage.*` 직접 호출 금지 (shared/storage.ts만 예외). 서버 SQLite(`settings.db`)는 에이전트가 읽는 값·시크릿용, localStorage는 UI 상태·디바이스 preference용
- **React Compiler**: `apps/webui`는 `babel-plugin-react-compiler`(`vite.config.ts`)로 자동 메모이제이션 적용. `useMemo`/`useCallback`/`React.memo`를 **성능 근거로 추가하지 않는다** — "referential stability", "재렌더 비용", "child prop 안정화" 류 이유는 Compiler 도입 이후 무효. 유효한 예외는 *의미적* 메모화뿐(외부 구독의 안정 key, effect deps 계약, 명시적 캐시). 예외로 남길 때는 **왜** 필요한지 한 줄 코멘트 필수. 리팩토링 중 마주친 기존 사용처는 근거 없으면 제거

## Data Storage Layout
```
apps/webui/data/
├── library/
│   └── templates/              # example_data에서 복사
│       ├── _order.json         # 사용자 지정 순서 힌트 (string[] of slugs; fs가 진실)
│       └── {template-name}/
│           ├── README.md       # frontmatter name/description = 메타데이터 단일 소스
│           ├── COVER.*         # (선택) COVER.{webp,png,jpg,...} 자동 탐지
│           ├── SYSTEM.md
│           ├── SYSTEM.meta.md  # (선택) meta 세션용
│           ├── renderer/        # index.ts + optional index.css + lib/*.js vendor
│           ├── skills/         # environment: creative | meta 혼재 가능
│           └── files/
└── projects/
    └── {project-slug}/         # 폴더명이 slug — _project.json에 slug 필드 없음
        ├── _project.json       # ProjectMeta (name, createdAt, updatedAt, notes?)
        ├── COVER.*             # (선택) 템플릿에서 자동 복사
        ├── SYSTEM.md
        ├── SYSTEM.meta.md      # (선택)
        ├── sessions/           # {sessionId}.jsonl — 헤더 라인 + message tree nodes
        ├── renderer/            # index.ts + optional index.css + lib/
        ├── skills/
        └── files/              # 에이전트 작업 공간 (렌더러 입력)
            ├── characters/
            ├── personas/       # (선택) frontmatter role: persona = 사용자 페르소나
            ├── scenes/
            └── world/
```

## Renderer System
- **Isolation**: 각 프로젝트 렌더러는 same-origin iframe에서 실행. 호스트는 `<iframe src="/api/projects/:slug/renderer/?token=...">`만 배치. DOM/스크롤/애니메이션/이벤트 리스너는 렌더러가 소유
- **Contract**: `export function mount(container: HTMLElement, ctx: MountContext): RendererHandle`. `MountContext { files, baseUrl, assetsUrl, state, host }`; `RendererHandle { destroy(): void }`. `host: RendererHostApi`가 `sendAction`, `setTheme`, `subscribeState`, `subscribeFiles`를 제공. 렌더러는 독립 transpile되므로 `MountContext`/`RendererHostApi`/`RendererHandle` 등 타입을 파일 상단에 inline 선언 (npm import 불가)
- **File layout**: 프로젝트 루트 `renderer/` 폴더. `index.ts` 엔트리 (필수), `index.css` (선택, shell이 `<link>`로 자동 주입), `lib/*.js` vendor 번들(idiomorph 등). `renderer/*.ts` 상대 import 가능
- **Server endpoints**:
  - `GET /api/projects/:slug/renderer/` — shell HTML 동적 생성 (base href + boot script)
  - `GET /api/projects/:slug/renderer/index.js` — `renderer/index.ts` transpile
  - `GET /api/projects/:slug/renderer/index.css` — 있으면 정적, 없으면 204
  - `GET /api/projects/:slug/renderer/:path.(js|ts|css)` — 상대 import용. `renderer/` 밖 접근은 `safeRendererPath` 차단
- **Boot handshake**: shell이 `mod.mount`를 확보한 뒤 `window.__agentchanBoot = ctx => mod.mount(root, ctx)` 세팅 후 `parent.postMessage({type:"renderer:ready", token})`. 호스트는 token 일치 확인 후 workspace files fetch → `contentWindow.__agentchanBoot(ctx)` 직접 호출 (same-origin이라 structured clone 없이 reference passing)
- **State push**: `host.subscribeState(cb)`는 `useRendererMount`의 rAF tick이 AgentState identity 변경을 감지해 snapshot 콜백 push. 렌더러가 자기 frame budget을 소유하므로 rAF coalesce는 렌더러 몫
- **Files push**: `host.subscribeFiles(cb)`는 초기 mount 시 1회 + streaming 종료 전이(true→false) 시 호스트가 workspace files 재fetch 후 push. streaming 중에는 snapshot 유지(네트워크 스킵). 초기 files는 `ctx.files`로 즉시 제공
- **Theme 전파**: 렌더러가 `host.setTheme(theme)`를 호출하면 호스트가 `RendererThemeContext`에 dispatch → AppShell이 전역 `--color-*` 오버라이드. iframe **내부** documentElement에도 동일 CSS 변수 주입(렌더러가 `var(--color-accent)` 그대로 참조 가능). shallow 비교로 중복 dispatch 차단. 토큰: `void/base/surface/elevated/accent/fg/fg2/fg3/edge`. `prefersScheme` 명시 시 프로젝트 페이지 한정 강제 오버라이드
- **Action 브리지**: `data-action` / `data-text` HTML 컨벤션은 이제 **렌더러 내부 규약** (호스트는 관여 안 함). 렌더러가 자기 click delegation으로 잡아 `host.sendAction({ type: "send" | "fill", text })` 호출. 호스트 수신 후 `RendererActionContext`로 dispatch → BottomInput이 consume
- **Cross-fade & race 가드**: `RenderedView`가 front/fading 2-slot iframe을 React key 기반으로 reconcile. slug 전환 시 prev → fading (300ms opacity → DOM 제거), new → front. 각 slot에 `token = Math.random()` 부여해 `renderer:ready` 메시지가 현재 활성 token과 다르면 drop
- **Error isolation**: iframe boot script가 `mount()` 예외를 catch해 `renderer:error` postMessage → 호스트가 iframe 위에 neutral overlay 표시. iframe 자체는 격리되어 호스트 UI는 무사
- **Renderer State** — `ctx.state: AgentState`는 pi `agent.state`(agent/types.ts:221)의 UI subset. idle 시 `EMPTY_AGENT_STATE = { messages:[], isStreaming:false, pendingToolCalls: new Set() }`. 필드:
  - `messages: AgentMessage[]` — persisted activePath(meta 노드 제외) + 아직 persist되지 않은 in-flight `ToolResultMessage` 합성. `role: "user" | "assistant" | "toolResult"` 기준으로 분기
  - `streamingMessage?: AssistantMessage` — 현재 in-flight assistant message. pi `AssistantMessageEvent.partial`이 매 이벤트마다 그대로 들어와 단순 replace됨. content는 시간순으로 [text, toolCall, text, ...] 인터리빙 가능
  - `pendingToolCalls: ReadonlySet<string>` — 실행 시작은 했지만 결과가 도착하지 않은 toolCall id 집합. 결과가 도착하면 `messages`에 toolResult로 합쳐지고 이 set에서 제거됨
  - tool 결과를 보려면 `state.messages`에서 `role === "toolResult" && toolCallId === id`로 찾는다 — 별도 result 필드 없음. 진행 중 여부는 `state.pendingToolCalls.has(id)`
- **Asset URL**: `ctx.assetsUrl` = `baseUrl + "/files"` 사전 pre-join. 이미지/오디오/기타 에셋은 `${ctx.assetsUrl}/characters/name/avatar` 등. `/files/:path` 라우트는 확장자 없는 경로에 대해 이미지 확장자 탐색 폴백 지원
- **렌더러는 iframe document 전체를 소유** — `container.ownerDocument`가 iframe의 document. 따라서 scroll, body style, keyboard event 등 자유롭게 조작 가능. 호스트 document와 완전 격리

## Session Compact
- `compactSession()`이 `meta: "compact-summary"` 노드 생성 (microCompact: 토큰 예산 retention). 새 세션 이어가기 지시는 SYSTEM.md 책임. agentchan은 pi와 달리 compact 시 새 session 파일을 만들어 `compactedFrom`으로 이전 session 참조 — 세션 간 계승 모델

## Project Architecture (2-Concept + files/)
시스템 개념은 2개뿐:
- **SYSTEM.md** — 프로젝트 행동의 단일 원천. plain markdown, system prompt에 원문 주입, compaction-safe
- **Skill** (`skills/*/SKILL.md`) — on-demand 절차. catalog(name+description)만 system prompt, body는 활성화 시에만 tool result로 전달

나머지는 전부 **파일** (`files/` 안): 사용자 콘텐츠. 디렉토리 구조 자유, 시스템이 강제하는 이름/구조 없음. 시스템은 `ProjectFile[]`로 스캔하여 `.md`의 YAML frontmatter를 파싱하지만 해석하지 않음 — 의미 부여는 렌더러 몫

### LLM 지침 파일 작성 규칙
`SYSTEM.md` · `SKILL.md` · `SYSTEM.meta.md` 는 시스템 프롬프트/툴 결과에 주입되어 LLM이 매 턴 읽는 **살아있는 지침**이다. 문서나 해설이 아니라 실행 프롬프트. 작성·수정 시 아래 네 가지 패턴은 **쓰지도 말고, 발견 즉시 제거**한다.

- **변천사·deprecation**: "더 이상 ~하지 않습니다", "과거엔 ~였지만 이제 ~", "~는 제거됨". 과거 이력은 git log · PR 설명의 몫
- **자기참조·재강조**: 앞줄에 이미 규칙을 명시했는데 "~을 그대로 사용한다", "이 값을 이대로 쓴다" 식으로 한 번 더 강조하는 꼬리 문장. 규칙은 한 번만 쓴다
- **설계 합리화**: "이 키는 영문이 아닌 한글이다", "왜 이렇게 했느냐면…", "통일성을 위해" 같이 결정 배경·의도를 설명하는 문장. 결정 배경은 CLAUDE.md · PR 설명의 몫
- **guard 중복**: 예제로 이미 드러난 규칙을 별도 "주의/금지" 섹션에 다시 서술 — 좋은 예제 하나가 더 강력하다

**판단 기준**: 해당 문장을 지워도 LLM 행동이 동일한가? 동일하면 덜어낸다. 제약·엣지케이스(총합 6, 음수 허용, 변동 없으면 write 생략)는 행동을 바꾸므로 남긴다.

### renderer/index.ts 작성 규칙

- 한국어가 들어갈 가능성이 있는 영역에는 절대 monospace 폰트를 사용하지 않는다.

### Skill 시스템
- Skill body는 `activate_skill` tool의 **tool result에 직접 포함** — tool_call→tool_result 교환이 전부, 별도 노드/콜백 없음
- Slash command (`/skill-name`)는 user message로 body 주입 — `build.ts`의 `buildUserNodeForPrompt`가 `meta: "skill-load"` TreeNode 생성
- 스킬의 `scripts/*.ts`는 self-contained — 스킬 간 헬퍼 공통화 금지, 소량 중복 허용
- 템플릿 skills → 프로젝트 생성 시 복사. catalog은 system prompt에 위치

### System Prompt 합성
```
[1] DEFAULT_SYSTEM_PROMPT (하드코딩)
[2] SYSTEM.md body (원문 그대로) — meta 세션에서는 SYSTEM.meta.md
[3] Skill catalog (해당 environment의 스킬만; name+description 자동 생성)
```

## Meta Session
창작 컨텍스트와 분리된 프로젝트 구성 작업(renderer 빌드 등) 전용 세션 모드. 창작 대화를 오염시키지 않기 위해 도입.
- **Session header**: `mode: "creative" | "meta"` 필드. 기존 세션은 creative로 가정
- **Skill environment**: 스킬 frontmatter `environment: meta | creative` (기본 creative). `orchestrator.ts`가 세션 모드에 맞는 스킬만 catalog에 노출
- **System prompt**: meta 세션은 `SYSTEM.meta.md` 사용 (없으면 빈 값)
- **Tools**: meta 세션에만 `validate-renderer` 도구 추가 등록 — transpile + `mount` export shape 검증. 실제 렌더링은 iframe DOM이 필요하므로 UI에서 사용자가 확인
- **자동 생성**: creative 세션에서 meta 스킬 슬래시 커맨드(`/build-renderer` 등) 입력 시 클라이언트가 자동으로 meta 세션 생성 + 전환 (`tryExecuteCommand`). SessionTabs에 meta 세션은 ⚙ 아이콘으로 표시
- **대표 meta 스킬**: `build-renderer` — 모든 템플릿에 배포되는 renderer/index.ts 생성·수정 워크플로우

## Example Data
- `example_data/`가 source of truth(git에 커밋), `apps/webui/data/`는 gitignored 런타임. **내용 변경은 `example_data/`에만** 가한다
- 동기화: 메인 트리는 `bash scripts/copy-example-data.sh [--force]`. Worktree는 SessionStart hook이 자동 실행
- **세션 중 `example_data/` 수정 시**: hook은 세션 시작 1회만 돌므로 `copy-example-data.sh --force`를 수동 재실행해야 `data/`에 반영됨

## Single Executable Build
- `bun run build:exe` — Vite client build → Bun `--compile` server → sidecar 복사 (public/, data/)
- 경로 해석: `src/server/paths.ts`가 dev/compiled 모드 분기의 단일 소스
- **Bun compiled binary에서 `import.meta.dir`은 가상 경로(`B:\~BUN\root`)를 반환** — 절대 사용 금지. 대신 `dirname(process.execPath)` 사용
- exe 테스트: 별도 폴더에 복사 후 실행해야 dev 환경과 격리된 검증 가능
- sidecar 구조: `agentchan.exe` + `public/` (Vite 빌드) + `data/` (example_data 복사본)
- **Script tool**: 에이전트가 코드 실행 시 사용. `process.execPath`로 spawn하므로 dev에서는 사용자 `bun`, exe에서는 `BUN_BE_BUN=1`로 자기 자신 호출 → end user에게 별도 Bun 설치 불필요

## Custom Provider Internals
- Custom provider의 모델 객체 생성: `resolveModel()` in `packages/creative-agent/src/agent/orchestrator.ts` — synthetic model 반환
- **pi-ai reasoning 게이트**: thinking 활성화에는 2개 조건 모두 필요: (1) Agent의 `options.reasoning` ≠ undefined, (2) model 객체의 `reasoning: true`. 하나라도 false면 thinking config가 API 요청에 미포함
- Custom provider 관련 타입은 서버(`src/server/types.ts`)와 클라이언트(`src/client/entities/config/config.types.ts`) 양쪽에 미러링됨
- **Built-in providers**: Vercel AI Gateway 포함. `config.service.ts`의 `BUILTIN_PROVIDERS` 화이트리스트와 `ALLOWED_MODELS`가 노출 범위를 결정 — pi-ai에 등록된 provider라도 이 두 목록에 추가해야 built-in으로 노출됨

## Code Conventions
- Server/client 양쪽에서 쓰는 순수 유틸리티는 별도 패키지로 분리 (예: `packages/estimate-tokens`). `.mjs` + `.d.ts`만으로 구성, 빌드 스텝 없음
- Server types in `src/server/types.ts`, client types in `src/client/entities/*/` (entity별 .types.ts)
- Route 팩토리(`createXxxRoutes()`) → `app.route()`으로 마운트. 라우트는 `PROJECTS_DIR` 등 경로 상수 직접 import 금지 — 서비스를 통해 접근
- Slug-based project folder names (Korean preserved, spaces to hyphens, lowercase ASCII). **`_project.json`에는 slug 필드 없음** — 폴더명이 단일 원천. `ProjectMeta`(디스크) vs `Project = ProjectMeta & { slug }`(런타임/API) 구분
- 초기 "General" 프로젝트 자동 생성은 **없음**. 0개 상태가 정상 — `ProjectPage`는 EmptyState로 Templates 페이지 유도
- **Template → Project 복사**: 하드코딩 allowlist 금지. `readdir` + denylist(`_project.json`, `_order.json`, 내부 메타)로 복사하여 새 파일(SYSTEM.meta.md 등) 추가 시 자동 반영
- **Version embedding**: 서버의 `update.service.ts`는 GitHub releases API로 1시간 캐시 체크. `package.json`의 version은 **JSON import로 임베드** (dynamic `readFile` 금지 — bun `--compile` 바이너리 호환)
- Agent 도구 LLM 가이드는 2층: 시스템 프롬프트(`creative-agent/src/agent/orchestrator.ts`)는 선택 규칙("X 대신 Y", 부재 도구 명시), 각 도구의 `description`은 사용법(파라미터/출력 형식). `tools/edit.ts`의 `DESCRIPTION` 상수가 모범
- **Tree tool**: 세션 시작 시 에이전트가 프로젝트 구조 파악용으로 사용. 과거 `ls` 도구는 제거됨 — `tree`가 한 번의 호출로 전체 디렉토리를 반환해 반복 호출 비용을 줄임
