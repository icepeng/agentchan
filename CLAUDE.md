# agentchan

## Build & Dev
- `bun install` — install dependencies (Bun workspaces)
- `bun run dev` — start dev server (apps/webui): Hono backend :3000 + Vite client :4100
- `bun run dev -- --port 3001` — custom port (client auto :4101). Worktree 등 병렬 작업 시 포트 충돌 방지용
- `bun run build` — production build via Turbo
- `bunx tsc --noEmit` — type-check (run from `apps/webui/` or `packages/creative-agent/`). Do NOT use `npx tsc`.
- `bun run lint` — ESLint 전체 실행 (Turbo). 에러 방지 규칙만 적용 (포매팅/스타일 규칙 없음)

## Dev Server Management (for Claude Code)
- 포트 3000은 사용자 전용. Claude Code는 3001~3099 범위에서 고유 포트 지정
- 실행 전 `curl -s http://localhost:PORT/api/config`로 확인 → `cd apps/webui && bun scripts/dev.ts --port PORT` (반드시 `run_in_background: true`)
- 클라이언트 포트 = 서버 포트 + 1100. 실행 실패 시 재시도 말고 원인 파악. 종료는 불필요 (`dev.ts`가 자동 정리)
- **Worktree 자동화**: `SessionStart` hook (`scripts/setup-worktree.sh`)이 worktree 감지 시 `example_data/` → `apps/webui/data/` 복사 + 전용 포트 할당. `$DEV_PORT`/`$DEV_CLIENT_PORT` 환경변수로 포트 확인. 서버는 자동 실행되지 않으므로 필요 시 수동 기동

## Monorepo Structure
- `packages/creative-agent` — Creative agent library (@agentchan/creative-agent): tools (AgentTool), skills, session/tree, orchestration. Built on `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`
- `packages/estimate-tokens` — Token estimation utilities (@agentchan/estimate-tokens): 순수 .mjs 파일 하나, 빌드 불필요. Server/client 양쪽에서 import 가능
- `apps/webui` — Web UI: React 19 + Hono + Vite + Tailwind v4. Project CRUD, library, renderer stays here

### Dependency Graph
```
@mariozechner/pi-ai → @mariozechner/pi-agent-core → @agentchan/creative-agent → @agentchan/webui
                                                                       ↑                    ↑
                                                         @agentchan/estimate-tokens ─────────┘
```

## Web UI Architecture
- **Server**: 3-layer architecture — Route → Service → Repository. Hono Context DI (`c.get()`)로 서비스 주입
- **Client**: Feature-Sliced Design 기반 — `app/ → pages/ → features/ → entities/ → shared/` 레이어 계층
- **Storage**: File-based JSONL in `apps/webui/data/` (gitignored), split into `data/library/` and `data/projects/`
- **Streaming**: SSE (Server-Sent Events) for agent responses
- **Design system**: Obsidian Teal — colors in `src/client/main.css`, fonts: Syne/Lexend/Fira Code
- **Layout**: Split-pane — left: rendered output, right: agent chat (collapsible), bottom: input
- **Routing**: State-based via `currentPage` in `app/context/UIContext.tsx` (no react-router). Pages: main, library, project-settings, settings
- **Renderer system**: Per-project `renderer.ts` — server에서 TS→JS transpile, client에서 Blob URL dynamic import로 실행. Library renderers in `data/library/renderers/`

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

## Client Layer Architecture (FSD-inspired)
```
app/              ← 최상위: UIContext, providers 조합, AppShell, Sidebar
pages/            ← PageRoute 1:1 매핑 (조합만, 로직 없음)
features/         ← 도메인 UI + 오케스트레이션 훅 (chat, project, library, settings, output)
entities/         ← 도메인 모델 + 상태(Context) + API (project, session, config, skill)
shared/           ← 순수 UI 컴포넌트 + 유틸리티 (context 접근 금지)
```
- **의존 규칙**: 하향만 (app→pages→features→entities→shared). 모듈 경계는 `index.ts`, 외부에서 내부 파일 직접 import 금지
- **import**: 모듈 간 `@/client/...` 절대 경로, 모듈 내 `./` 상대 경로. Entity별 독립 Context (Project, Session, Config, Skill)
- **Cross-domain 오케스트레이션**: features/ 훅에서 담당 (예: `useProject.selectProject`가 session+skill clear)

## Data Storage Layout
```
apps/webui/data/
├── library/                    # Shared library (skills + renderers)
│   ├── skills/                 # Library skills (SKILL.md in subdirs)
│   │   └── {skill-name}/SKILL.md
│   └── renderers/              # Library renderers (.ts files)
│       └── {name}.ts
└── projects/                   # Project folders
    └── {project-slug}/
        ├── _project.json       # Project metadata (single JSON)
        ├── conversations/      # Conversation JSONL files (no index file)
        │   └── {sessionId}.jsonl  # Header line + message tree nodes per session
        ├── renderer.ts         # Per-project renderer (export function render(ctx: RenderContext) => HTML)
        ├── skills/             # Per-project skills (copied from library or created)
        └── output/             # Renderer output directory
```

## Renderer System
- Each project has its own `renderer.ts` in its data folder (e.g., `data/projects/default/renderer.ts`)
- Contract: `export function render(ctx: RenderContext): string` — receives context (outputFiles, skills with metadata, baseUrl), returns HTML
- 렌더러는 독립 transpile되므로 `RenderContext` 등 타입을 파일 내에 inline 선언해야 함 (import 불가)
- **Server**: TS→JS transpile only (`Bun.Transpiler`). 실행하지 않음
- **Client**: transpiled JS를 Blob URL로 dynamic import하여 `render(ctx)` 실행 (`features/project/useOutput.ts`)
- `ctx.baseUrl`로 프로젝트 에셋 URL 구성 (예: `ctx.baseUrl + "/files/skills/{name}/assets/avatar"`)
- `/files/:path` 라우트는 확장자 없는 경로에 대해 이미지 확장자 탐색 폴백 지원
- Image tokens: `[skill-name:path]` — 줄 앞이면 아바타, 본문 중이면 인라인 일러스트로 렌더링
- If `renderer.ts` is missing or render fails, error HTML is shown
- Library renderers in `data/library/renderers/` — managed via Library page UI
- Output refreshes when agent streaming completes (isStreaming → false)

## Skill Conventions for Creative Use
- **Skill is the only first-class concept**. Personas, frameworks, world settings, writing styles — all of them are just Skills with different content and flags. The system never branches on category, and users should not have to learn a fixed taxonomy
- Activation modes (orthogonal frontmatter flags, both default off):
  - `always-active: true` — body is injected into the system prompt for the entire session. Use for personas, world settings, persistent style guides
  - `disable-model-invocation: true` — hidden from the model's `activate_skill` catalog. The skill is reachable only via user `/skillname` slash command
  - Default (both off) — model decides when to invoke via `activate_skill`. Slash invocation also works
- All Skills, regardless of flags, can be invoked by slash command unless `always-active` (already in the prompt — slash would be redundant). Always-active skills are hidden from slash autocomplete
- `metadata.tags` is a free user-input list — used only for grouping/search in the UI. The system does not branch on tag values
- Character/world skills typically combine `always-active: true` with display metadata: `metadata.display-name`, `metadata.color` (hex), `metadata.avatar-image`. Images via `[skill:path]` tokens in output, files in skill `assets/` folder
- `metadata.recommended-renderer` (string) lets a skill suggest a renderer for its project — surfaced in the renderer picker UI
- Library skills managed via Library page UI, copied to projects as needed
- No explicit "modes" — skill composition + flags determine AI behavior, renderer determines display
- 스킬의 `scripts/*.ts`는 사용자가 한 파일만 읽고 이해할 수 있게 self-contained — 스킬 간 헬퍼 공통화 금지, 소량 중복 허용

## Example Data
- `example_data/`는 git에 커밋되는 예시 데이터 (스킬, 렌더러, 프로젝트 등)
- `apps/webui/data/`는 gitignored 런타임 데이터 — 직접 수정하지 않는다
- **스킬/렌더러/프로젝트 예시 데이터의 내용 변경은 `example_data/`에만 가한다** (`apps/webui/data/`는 건드리지 않음)
- 앱이 초기화 시 `example_data/`를 `apps/webui/data/`로 복사하므로, 소스 오브 트루스는 항상 `example_data/`
- 같은 스킬이 `library/skills/{name}/`와 `projects/{slug}/skills/{name}/` 양쪽에 존재할 수 있음 — 항상 `library/` 쪽을 먼저 수정한 뒤 `cp`로 `projects/{slug}/skills/{name}/`에 동기 (`diff -r`로 검증)

## Single Executable Build
- `bun run build:exe` — Vite client build → Bun `--compile` server → sidecar 복사 (public/, data/)
- 경로 해석: `src/server/paths.ts`가 dev/compiled 모드 분기의 단일 소스
- **Bun compiled binary에서 `import.meta.dir`은 가상 경로(`B:\~BUN\root`)를 반환** — 절대 사용 금지. 대신 `dirname(process.execPath)` 사용
- exe 테스트: 별도 폴더에 복사 후 실행해야 dev 환경과 격리된 검증 가능
- sidecar 구조: `agentchan.exe` + `public/` (Vite 빌드) + `data/` (example_data 복사본)

## Custom Provider Internals
- Custom provider의 모델 객체 생성: `resolveModel()` in `packages/creative-agent/src/agent/orchestrator.ts` — synthetic model 반환
- **pi-ai reasoning 게이트**: thinking 활성화에는 2개 조건 모두 필요: (1) Agent의 `options.reasoning` ≠ undefined, (2) model 객체의 `reasoning: true`. 하나라도 false면 thinking config가 API 요청에 미포함
- Custom provider 관련 타입은 서버(`src/server/types.ts`)와 클라이언트(`src/client/entities/config/config.types.ts`) 양쪽에 미러링됨

## Code Conventions
- Server/client 양쪽에서 쓰는 순수 유틸리티는 별도 패키지로 분리 (예: `packages/estimate-tokens`). `.mjs` + `.d.ts`만으로 구성, 빌드 스텝 없음
- Server types in `src/server/types.ts`, client types in `src/client/entities/*/` (entity별 .types.ts)
- Route 팩토리(`createXxxRoutes()`) → `app.route()`으로 마운트. 라우트는 `PROJECTS_DIR` 등 경로 상수 직접 import 금지 — 서비스를 통해 접근
- Slug-based project folder names (Korean preserved, spaces to hyphens, lowercase ASCII)
- All new type fields should be optional for backward compatibility with existing data
- `updateProject` takes a partial updates object, not positional args
- Agent 도구 LLM 가이드는 2층: 시스템 프롬프트(`creative-agent/src/agent/orchestrator.ts`)는 선택 규칙("X 대신 Y", 부재 도구 명시), 각 도구의 `description`은 사용법(파라미터/출력 형식). `tools/edit.ts`의 `DESCRIPTION` 상수가 모범
