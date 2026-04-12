# agentchan

## Build & Dev
- `bun install` — install dependencies (Bun workspaces)
- `bun run dev` — start dev server (apps/webui) via portless: `https://agentchan.localhost` (worktree에서는 `branch.agentchan.localhost`)
- `bun run dev -- --port 3001` — portless 없이 수동 포트 지정 (server :3001, client :4101)
- `bun run build` — production build via Turbo
- `bunx tsc --noEmit` — type-check (run from `apps/webui/` or `packages/creative-agent/`). Do NOT use `npx tsc`.
- `bun run lint` — ESLint 전체 실행 (Turbo). 에러 방지 규칙만 적용 (포매팅/스타일 규칙 없음)

## Dev Server Management (for Claude Code)
- `bun run dev` → portless가 ephemeral 포트 자동 할당 + `agentchan.localhost` URL 매핑. 포트 충돌 없음
- portless 없이 수동: `cd apps/webui && bun scripts/dev.ts --port PORT` (반드시 `run_in_background: true`)
- 실행 실패 시 재시도 말고 원인 파악. 종료는 불필요 (`dev.ts`가 자동 정리)
- **Worktree 자동화**: `SessionStart` hook (`scripts/setup-worktree.sh`)이 worktree 감지 시 `example_data/` → `apps/webui/data/` 복사. `bun run dev`로 서버 기동하면 portless가 branch 서브도메인 자동 할당 (e.g. `fix-ui.agentchan.localhost`)

## Monorepo Structure
- `packages/creative-agent` — Creative agent library (@agentchan/creative-agent): tools (AgentTool), skills, session/tree, orchestration. Built on `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`. Source-first (빌드 없음, `main`/`types`가 `src/index.ts` 직접 참조)
- `packages/estimate-tokens` — Token estimation utilities (@agentchan/estimate-tokens): 순수 .mjs 파일 하나, 빌드 불필요. Server/client 양쪽에서 import 가능
- `packages/grep` — Pure ripgrep-style 파일 검색 (@agentchan/grep): walker + matcher만 제공, 빌드 불필요. `creative-agent`의 grep tool에서 사용
- `apps/webui` — Web UI: React 19 + Hono + Vite + Tailwind v4. Project CRUD, templates, renderer, edit mode

### Dependency Graph
```
@mariozechner/pi-ai → @mariozechner/pi-agent-core → @agentchan/creative-agent → @agentchan/webui
                                                                       ↑                    ↑
                                                         @agentchan/estimate-tokens ─────────┘
                                                         @agentchan/grep ─→ creative-agent
```

## Web UI Architecture
- **Server**: 3-layer architecture — Route → Service → Repository. Hono Context DI (`c.get()`)로 서비스 주입
- **Client**: Feature-Sliced Design 기반 — `app/ → pages/ → features/ → entities/ → shared/` 레이어 계층
- **Storage**: File-based JSONL in `apps/webui/data/` (gitignored), split into `data/library/templates/` and `data/projects/`
- **Streaming**: SSE (Server-Sent Events) for agent responses
- **Design system**: Obsidian Teal — colors in `src/client/main.css`, fonts: Syne/Lexend/Fira Code
- **Layout**: Split-pane — left: rendered output, right: agent chat (collapsible), bottom: input
- **Routing**: State-based via `currentPage` in `entities/ui/UIContext.tsx` (no react-router). Pages: main, templates, settings
- **ViewMode**: `"chat" | "edit"` — UIContext에서 관리. Edit mode는 AgentPanel 헤더에서 토글
- **Renderer system**: Per-project `renderer.ts` — server에서 TS→JS transpile, client에서 Blob URL dynamic import로 실행
- **Templates**: 프로젝트 생성용 프리셋 목록 (`data/library/templates/`). `_template.json` 메타데이터 + SYSTEM.md + skills/ + renderer.ts + files/
- **Project Settings**: name/notes 편집 모달. SYSTEM.md/skills/renderer.ts 편집은 Edit Mode에서 직접 수행

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
- **Template repo**: `createTemplateRepo(dir)` — 디렉토리 기반 CRUD. `_template.json` 메타데이터 + 전체 프로젝트 파일 복사

## Client Layer Architecture (FSD-inspired)
```
app/              ← 최상위: UIContext, providers 조합, AppShell, Sidebar
pages/            ← PageRoute 1:1 매핑 (조합만, 로직 없음)
features/         ← 도메인 UI + 오케스트레이션 훅 (chat, project, editor, settings, onboarding)
entities/         ← 도메인 모델 + 상태(Context) + API (project, session, config, skill, editor, template, ui, renderer-action)
shared/           ← 순수 UI 컴포넌트 + 유틸리티 (context 접근 금지)
i18n/             ← 다국어 사전 + Context (en.ts/ko.ts + LanguagePreference). `t(key)` 훅으로 사용
```
- **의존 규칙**: 하향만 (app→pages→features→entities→shared). 모듈 경계는 `index.ts`, 외부에서 내부 파일 직접 import 금지
- **import**: 모듈 간 `@/client/...` 절대 경로, 모듈 내 `./` 상대 경로. Entity별 독립 Context (Project, Session, Config, Skill, Editor, UI)
- **Cross-domain 오케스트레이션**: features/ 훅에서 담당 (예: `useProject.selectProject`가 session+skill clear)
- **i18n**: 모든 사용자 노출 텍스트는 `t("key")` 사용. 키 추가 시 `i18n/en.ts`와 `i18n/ko.ts` 동시 갱신

## Data Storage Layout
```
apps/webui/data/
├── library/
│   └── templates/              # 프로젝트 생성 프리셋 (example_data에서 복사)
│       └── {template-name}/
│           ├── _template.json  # 템플릿 메타데이터 (name, description)
│           ├── SYSTEM.md
│           ├── renderer.ts
│           ├── skills/
│           └── files/
└── projects/                   # 프로젝트 폴더
    └── {project-slug}/
        ├── _project.json       # Project metadata (single JSON)
        ├── SYSTEM.md           # Project system prompt (plain markdown → system prompt에 주입)
        ├── conversations/      # Conversation JSONL files (no index file)
        │   └── {sessionId}.jsonl  # Header line + message tree nodes per session
        ├── renderer.ts         # Per-project renderer (export function render(ctx: RenderContext) => HTML)
        ├── skills/             # Per-project skills (copied from template or created)
        └── files/              # Workspace: 에이전트의 작업 공간 (렌더러 입력)
            ├── characters/     # 캐릭터 .md + assets/
            ├── scenes/         # RP 장면 출력
            └── world/          # 세계관 파일
```

## Renderer System
- Each project has its own `renderer.ts` in its data folder (e.g., `data/projects/chat/renderer.ts`)
- Contract: `export function render(ctx: RenderContext): string` — `RenderContext { files: ProjectFile[], baseUrl: string }`, HTML 반환
- `ProjectFile = TextFile | BinaryFile`. TextFile은 `path`, `content`, `frontmatter`(YAML 파싱 결과), `modifiedAt` 포함
- 렌더러는 독립 transpile되므로 `RenderContext` 등 타입을 파일 내에 inline 선언해야 함 (import 불가)
- **Server**: TS→JS transpile only (`Bun.Transpiler`). 실행하지 않음
- **Client**: transpiled JS를 Blob URL로 dynamic import하여 `render(ctx)` 실행 (`features/project/useOutput.ts`)
- `ctx.baseUrl`로 프로젝트 에셋 URL 구성 (예: `ctx.baseUrl + "/files/characters/elara-brightwell/assets/avatar"`)
- `/files/:path` 라우트는 확장자 없는 경로에 대해 이미지 확장자 탐색 폴백 지원
- Image tokens: `[name:path]` — 렌더러가 frontmatter의 `name` 필드로 캐릭터를 매칭하여 resolve
- If `renderer.ts` is missing or render fails, error HTML is shown
- 템플릿에 포함된 렌더러는 프로젝트 생성 시 복사됨. Edit mode에서 직접 편집
- Output refreshes when agent streaming completes (isStreaming → false)
- **렌더러는 순수 함수** — `files → HTML`. conversations, skills, SYSTEM.md, 에이전트 상태에 접근 불가. 도메인 모델(ChatLine, ChatGroup 등)은 렌더러 안에서만 존재. duck typing으로 파일 역할 판단 (frontmatter에 `display-name`이 있으면 캐릭터)
- **Renderer Actions** — 렌더러 HTML에 `data-action` + `data-text` 속성으로 인터랙티브 액션 선언. `data-action="send"` (즉시 전송), `data-action="fill"` (입력창에 채우기). `data-text` 생략 시 `textContent` 사용. 빈 텍스트 무시, 스트리밍 중 send 무시. `entities/renderer-action/`이 cross-feature 브릿지

## Edit Mode
- `features/editor/` — FileTree + CodeMirror 에디터로 프로젝트 전체 파일 편집 (SYSTEM.md, skills/, renderer.ts, files/)
- `entities/editor/` — EditorContext: 트리 엔트리, 선택 파일, dirty 상태 관리
- 토글: AgentPanel 헤더의 EditModeToggle (`entities/ui/EditModeToggle.tsx`). UIContext의 `viewMode: "chat" | "edit"`로 상태 관리
- 우클릭 컨텍스트 메뉴: 파일 삭제, 탐색기에서 열기
- UnsavedDialog: 파일 전환/모드 전환 시 미저장 변경 확인

## Conversation Compact
- 긴 대화를 요약하여 새 세션으로 이어가는 기능
- `packages/creative-agent/src/agent/compact.ts` — microCompact (토큰 예산 기반 retention)
- `conversation.service.ts`의 `compactConversation()` → 요약 노드(`meta: "compact-summary"`) 생성
- SYSTEM.md의 세션 이어가기 지시와 연동

## Project Architecture (2-Concept + files/)
시스템 개념은 2개뿐:
- **SYSTEM.md** — 프로젝트 행동의 단일 원천. plain markdown, system prompt에 원문 주입, compaction-safe
- **Skill** (`skills/*/SKILL.md`) — on-demand 절차. catalog(name+description)만 system prompt, body는 활성화 시에만 tool result로 전달

나머지는 전부 **파일** (`files/`):
- `files/` 안 = 사용자 콘텐츠 (캐릭터, 장면, 세계관 등). 디렉토리 구조 자유 — 시스템이 강제하는 이름/구조 없음
- `files/` 밖 = 시스템 인프라 (SYSTEM.md, skills/, conversations/, renderer.ts)
- 시스템은 `files/`를 스캔하여 `ProjectFile[]` 생성. .md의 YAML frontmatter를 파싱하지만 해석하지 않음 — 의미 부여는 렌더러 몫

### Skill 시스템
- Skill body는 `activate_skill` tool의 **tool result에 직접 포함** — tool_call→tool_result 교환이 전부, 별도 노드/콜백 없음
- Slash command (`/skill-name`)는 user message로 body 주입 — `build.ts`의 `buildUserNodeForPrompt`가 `meta: "skill-load"` TreeNode 생성
- 스킬의 `scripts/*.ts`는 self-contained — 스킬 간 헬퍼 공통화 금지, 소량 중복 허용
- 템플릿 skills → 프로젝트 생성 시 복사. catalog은 system prompt에 위치

### System Prompt 합성
```
[1] DEFAULT_SYSTEM_PROMPT (하드코딩)
[2] SYSTEM.md body (원문 그대로)
[3] Skill catalog (name+description 자동 생성)
```

## Example Data
- `example_data/`는 git에 커밋되는 예시 데이터 (소스 오브 트루스)
- `apps/webui/data/`는 gitignored 런타임 데이터 — 직접 수정하지 않는다
- **예시 데이터의 내용 변경은 `example_data/`에만 가한다** (`apps/webui/data/`는 건드리지 않음)
- 앱이 초기화 시 `example_data/`를 `apps/webui/data/`로 복사하므로, 소스 오브 트루스는 항상 `example_data/`
- 구조: `example_data/library/templates/{name}/` (프로젝트 프리셋 — _template.json + SYSTEM.md + skills/ + renderer.ts + files/)
- 메인 워킹 트리에서 동기는 `bash scripts/copy-example-data.sh [--force]` (worktree는 SessionStart hook이 자동 실행)

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

## Code Conventions
- Server/client 양쪽에서 쓰는 순수 유틸리티는 별도 패키지로 분리 (예: `packages/estimate-tokens`). `.mjs` + `.d.ts`만으로 구성, 빌드 스텝 없음
- Server types in `src/server/types.ts`, client types in `src/client/entities/*/` (entity별 .types.ts)
- Route 팩토리(`createXxxRoutes()`) → `app.route()`으로 마운트. 라우트는 `PROJECTS_DIR` 등 경로 상수 직접 import 금지 — 서비스를 통해 접근
- Slug-based project folder names (Korean preserved, spaces to hyphens, lowercase ASCII)
- All new type fields should be optional for backward compatibility with existing data
- `updateProject` takes a partial updates object, not positional args
- Agent 도구 LLM 가이드는 2층: 시스템 프롬프트(`creative-agent/src/agent/orchestrator.ts`)는 선택 규칙("X 대신 Y", 부재 도구 명시), 각 도구의 `description`은 사용법(파라미터/출력 형식). `tools/edit.ts`의 `DESCRIPTION` 상수가 모범
