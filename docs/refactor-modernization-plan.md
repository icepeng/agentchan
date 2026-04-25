# 리팩터 현대화 계획

이 문서는 modernization/refactor fan-out의 기준선이다. 목적은 동작을 바꾸지
않고 dead code, duplicated paths, oversized modules, stale abstractions,
legacy patterns를 작은 패스로 추적하는 것이다.

이 계획은 ADR이 아니다. 이미 accepted 상태인 ADR 계약을 기준으로 실제 정리
순서와 검증 항목을 잡는다.

## 보존할 계약

- Renderer V1은 `renderer/index.tsx`의 React default export와 선택적
  `theme(snapshot)` 계약을 유지한다.
- Renderer import는 `agentchan:renderer/v1`, `react`, `renderer/` 내부
  relative import, CSS import만 허용한다.
- Server는 Route -> Service -> Repository 3-layer를 유지한다.
- Client는 `app -> pages -> features -> entities -> shared` 의존 방향을
  유지한다.
- Agent system prompt는 base prompt, session mode별 `SYSTEM.md`, skill
  catalog를 합성한다. Skill body는 on-demand로만 들어간다.
- Agent tools는 project-scoped tools로 유지한다. 과거 `ls` tool은 되살리지
  않는다.
- Session JSONL은 기존 로그와 호환되어야 한다. `mode`가 없으면 creative로
  취급한다.
- 프로젝트 폴더명이 slug의 단일 원천이다. `_project.json`에 slug를 추가하지
  않는다.
- Template -> Project 생성은 선택한 템플릿 루트 엔트리를 모두 복사한다.
  새 루트 파일 추가를 allowlist 변경에 의존시키지 않는다.
- `apps/webui/data/`는 runtime copy다. 템플릿 source of truth로 취급하지
  않는다.
- Single executable 경로 해석은 `apps/webui/src/server/paths.ts`가 단일
  소스다. compiled binary에서는 실제 exe directory 기준을 유지한다.

## 현재 인벤토리

### Dead Code 후보

다음 항목은 제거 대상이라는 뜻이 아니라, fan-out 전에 사용 여부와 호환성
역할을 먼저 확인할 후보 목록이다.

- `packages/creative-agent/src/index.ts`는 Web UI server/client가 동시에
  소비하는 공개 surface다. 내보내는 값 중 server-only, client type-only,
  renderer build-only surface가 섞여 있다.
- `apps/webui/src/server/migrations/rename-conversations-to-sessions.ts`는
  과거 데이터 호환용이다. `server/index.ts`에서 호출되므로 즉시 dead code로
  보면 안 된다.
- `apps/webui/src/client/entities/session/session.types.ts`의 backwards-compatible
  alias는 UI 표시 경로에서 아직 참조될 수 있다.
- `packages/creative-agent/src/session/format.ts`의 header 없는 JSONL,
  `mode` omitted = creative, branch marker parsing은 기존 로그 호환 계약이다.
- example template renderer 안의 legacy 주석과 fallback 처리는 템플릿별
  사용자 콘텐츠 호환성일 수 있으므로 core refactor와 분리한다.

### Duplicated Paths와 상수

- Tool path containment: `packages/creative-agent/src/tools/_paths.ts`의
  `resolveInProject`는 agent tool 오류로 self-correction을 유도하기 위해
  throw한다.
- Web UI project file containment:
  `apps/webui/src/server/repositories/project.repo.ts`의 `resolveProjectFile`은
  HTTP 404/400 매핑과 hidden root 차단 정책을 포함해 `null`을 반환한다.
- Segment validation: `apps/webui/src/server/paths.ts`의
  `assertSafePathSegment`는 template/skill slug 같은 단일 path segment용이다.
- Image extensions는 server `IMAGE_EXTS`와 client editor `IMAGE_EXTS`가
  별도로 있다. server는 cover/file serving fallback, client는 icon/preview
  판별에 쓰므로 허용 목록을 맞출지, 의도적으로 분리할지 결정이 필요하다.
- Workspace scan과 edit-mode project tree scan은 모두 파일 트리를 걷지만
  출력 계약이 다르다. `scanWorkspaceFiles()`는 renderer snapshot용
  `ProjectFile[]`, `scanProjectTree()`는 editor tree용 `{ path, type,
  modifiedAt }[]`다.

### Oversized Modules

현재 line count 기준으로 다음 파일은 단일 책임을 더 작게 나눌 후보로 보인다.

- `apps/webui/src/client/features/project/ProjectTabs.tsx`
- `apps/webui/src/client/features/editor/FileEditor.tsx`
- `apps/webui/src/client/features/settings/SettingsView.tsx`
- `apps/webui/src/client/features/editor/FileTree.tsx`
- `apps/webui/src/client/features/chat/MessageBubble.tsx`
- `apps/webui/src/client/features/onboarding/OnboardingWizard.tsx`
- `apps/webui/src/client/features/project/SaveAsTemplateModal.tsx`
- `apps/webui/src/server/services/config.service.ts`
- `apps/webui/src/client/features/chat/useStreaming.ts`
- `apps/webui/src/client/features/project/renderer-host/useRendererHostMachine.ts`
- `packages/creative-agent/src/agent/prompt.ts`
- `packages/creative-agent/src/agent/orchestrator.ts`
- `packages/creative-agent/src/session/storage.ts`

이 목록은 변경 우선순위가 아니라 fan-out 후보군이다. 분리 전에는 해당 파일이
갖는 cross-domain orchestration 책임을 확인해야 한다.

### Stale Abstractions와 Legacy Patterns

- Session storage는 append-only JSONL과 rewrite가 공존한다. branch switch는
  marker append, subtree delete는 rewrite를 사용한다.
- Agent setup은 model resolution, prompt composition, skill filtering,
  tool construction, context compaction, streaming/logging hook을 한 함수에서
  조립한다.
- Config service는 built-in provider allowlist, custom provider persistence,
  OAuth, model selection fallback, onboarding flag를 함께 다룬다.
- `useStreaming()`은 optimistic node insertion, SSE event routing, SWR cache
  mutation, background notification, abort controller registry를 함께 다룬다.
- Renderer host machine은 transition statechart, dynamic import, theme
  application, layer mount, error display를 한 hook 안에서 관리한다.
- `apps/webui/index.html`의 초기 theme script는 direct `localStorage` 예외다.
  client runtime registry 규칙과 충돌하지 않도록 문서화된 부트스트랩 예외로
  유지하거나 별도 helper로 이동해야 한다.

## 제안 패스

### Pass 1. 공개 surface와 dead-code audit

현재 동작:

- Web UI server는 `@agentchan/creative-agent`에서 agent/session/renderer/config
  런타임 API를 import한다.
- Web UI client는 `@agentchan/creative-agent`를 type-only로 사용한다.
- 과거 session 파일과 migration entrypoint는 아직 런타임 호환성 경로다.

구조 개선:

- `packages/creative-agent/src/index.ts`의 export를 소비자별로 분류한다:
  server runtime, client type-only, test-only, renderer build, workspace utility.
- 사용처가 없는 export는 먼저 repo-wide search와 타입 체크로 확인한 뒤
  제거한다.
- 호환성 export는 제거하지 말고 `Compatibility surface`로 문서화하거나
  별도 barrel로 분리한다.

검증 체크:

- `rg`로 export 사용처 확인.
- `bunx tsc --noEmit`.
- `bun run test` 또는 최소 `cd packages/creative-agent && bun test tests/session tests/renderer tests/tools`.
- Web UI client에서 `@agentchan/creative-agent` value import가 생기지 않았는지
  `rg 'from "@agentchan/creative-agent"' apps/webui/src/client`로 확인.

### Pass 2. Path policy와 file inventory 정리

현재 동작:

- Agent tools는 project directory 안에서만 read/write/edit/script/tree/grep을
  수행한다.
- Web UI file API는 hidden roots를 차단하고, `files/` 아래 static serving은
  extensionless image fallback을 제공한다.
- Renderer snapshot은 `files/` workspace만 scan하고 dotfile을 건너뛴다.

구조 개선:

- `resolveInProject`, `resolveProjectFile`, `assertSafePathSegment`의 차이를
  유지한 채 공통 순수 helper가 필요한 부분만 추출한다.
- server/client image extension 목록을 하나로 맞출지, server serving 정책과
  client display 정책으로 분리 유지할지 결정한다.
- workspace scan과 editor tree scan의 공통 walk 로직을 추출할 수 있는지
  확인하되 출력 타입은 유지한다.

검증 체크:

- `packages/creative-agent` tools containment 테스트.
- workspace scan/frontmatter 테스트.
- Web UI project file read/write/delete/rename route smoke check.
- Renderer snapshot에서 dotfile, data parse failure fallback, binary digest가
  유지되는지 테스트.

### Pass 3. Server config service 분리

현재 동작:

- `config.service.ts`가 provider/model 목록, allowed model filtering, custom
  provider persistence, OAuth login/logout/token refresh, config persistence,
  onboarding flag를 한 서비스에서 제공한다.
- Custom provider reasoning은 model 객체와 Agent option 양쪽 계약에 영향을 준다.
- OAuth provider는 sign-in 전 모델 목록을 비워 선택 실패를 막는다.

구조 개선:

- Provider catalog, persisted config loader, OAuth credential lifecycle,
  custom provider CRUD를 내부 helper 모듈로 분리한다.
- route/service 외부 계약은 유지하고 `ConfigService = ReturnType<typeof
  createConfigService>` 패턴을 보존한다.
- allowed models 목록과 default provider/model fallback을 한 곳에서 테스트하기
  쉽게 만든다.

검증 체크:

- config routes 타입 체크.
- provider list, custom provider save/delete, OAuth logout fallback 단위 테스트
  추가 또는 기존 route-level smoke.
- custom provider에서 `reasoning` 계약이 깨지지 않았는지 agent config resolution
  확인.

### Pass 4. Agent orchestration 분리

현재 동작:

- `runPrompt()`/`runRegenerate()`는 session tree load, user node persistence,
  agent setup, abort bridging, usage rollup, assistant node persistence를
  처리한다.
- `setupCreativeAgent()`는 prompt composition, skill environment filtering,
  tool construction, model resolution, compaction, cache hook, logging을
  조립한다.
- AbortSignal은 `Agent.abort()`로 연결된다.

구조 개선:

- prompt composition, skill/tool selection, model resolution, streaming event
  logging을 작은 pure/helper 모듈로 분리한다.
- session persistence envelope과 agent turn execution의 경계를 명확히 한다.
- system prompt 선택 규칙과 tool description 역할은 ADR 0007 그대로 둔다.

검증 체크:

- `cd packages/creative-agent && bun test tests/session tests/tools tests/slug.test.ts`.
- abort 연결 테스트 또는 수동 SSE abort 확인.
- skill activation catalog/body 분리 회귀 테스트.
- JSONL 기존 fixture가 header/mode omitted 파일을 계속 읽는지 확인.

### Pass 5. Client streaming과 session state 정리

현재 동작:

- `useStreaming()`은 optimistic user node를 SWR cache에 넣고, server echo로
  temp id를 real id로 교체한다.
- stream event는 originating project/session key로 라우팅되어 project switch
  이후에도 cache write가 섞이지 않는다.
- per-project AbortController registry는 module scope에 있다.
- background stream 완료/오류는 notification으로 알려준다.

구조 개선:

- SSE callback factory, optimistic cache mutation, notification routing,
  abort registry 접근을 작은 helper로 분리한다.
- feature hook은 orchestration만 남기고 entity API/cache 조작은 entities
  쪽 public API로 모은다.
- React Compiler 전제를 유지하고 성능 목적의 memoization을 추가하지 않는다.

검증 체크:

- send/regenerate happy path.
- project switch 중 background stream 완료 notification.
- abort 버튼 또는 project delete 시 abort가 error toast로 새지 않는지 확인.
- session branch/regenerate 후 activePath가 유지되는지 확인.

### Pass 6. Renderer host lifecycle 정리

현재 동작:

- Renderer host machine은 fade-out/import/theme/mount/fade-in statechart를
  관리한다.
- import가 먼저 끝나도 fade-out과 theme transition 순서를 지킨다.
- mounted renderer는 snapshot store를 통해 최신 snapshot을 받는다.
- import/theme/runtime error는 visible error로 전환된다.

구조 개선:

- statechart transition 계산을 pure reducer로 떼고, React hook은 timers,
  dynamic import, layer side effect만 담당하게 한다.
- theme evaluation과 mount side effect를 별도 helper로 분리한다.
- Renderer V1 public contract와 host implementation detail을 섞지 않는다.

검증 체크:

- renderer build/policy/theme 테스트.
- Web UI에서 project switch, renderer import error, theme change를 브라우저로
  확인.
- desktop/mobile viewport에서 renderer primary surface가 비어 있지 않은지 확인.

### Pass 7. Client feature component split

현재 동작:

- Project tabs, file editor/tree, settings, onboarding, chat bubble,
  save-as-template modal은 UI state와 domain action을 같은 파일에서 많이
  처리한다.
- 사용자 노출 텍스트는 i18n key를 사용한다.
- Client import는 FSD public `index.ts`와 `@/client/...` 절대 경로를 따른다.

구조 개선:

- 반복 UI 조각은 feature 내부 하위 컴포넌트로 먼저 분리한다.
- domain state/API/type은 entities로 끌어내리고, shared는 domain context를
  import하지 않게 유지한다.
- visible behavior, keyboard/focus, modal lifecycle을 바꾸지 않는다.

검증 체크:

- `bunx tsc --noEmit`.
- `bun run lint`.
- 해당 화면별 browser smoke: project create/duplicate/rename/delete,
  editor read/write/rename/delete, settings provider/model update,
  onboarding completion.
- i18n key가 en/ko에 모두 있는지 확인.

### Pass 8. Template save/copy 계약 정리

현재 동작:

- Template -> Project는 템플릿 루트 엔트리를 모두 복사한다.
- Save Project as Template은 `SYSTEM.md`, `README.md`, `renderer/`, `skills/`,
  `COVER.*`, `files/`를 선택적으로 복사하고 `files/` exclude를 적용한다.
- README가 있으면 skeleton metadata를 다시 반영한다.
- 사용자 authored template은 trust를 true로 저장한다.

구조 개선:

- Template -> Project copy와 Save-as-template copy는 다른 제품 동작임을
  문서화하고 테스트 이름에도 드러낸다.
- Save-as-template의 선택 복사 정책은 allowlist가 아니라 사용자 export
  surface로 명명한다.
- cover probing은 `probeCover()` 흐름으로 유지한다.

검증 체크:

- template list/create project/save-as-template route smoke.
- README metadata 보존과 description 갱신.
- cover detection.
- 기존 프로젝트가 template 변경을 자동 반영하지 않는 계약 확인.

## Fan-out 순서 제안

1. Pass 1로 공개 surface와 호환성 항목을 분류한다.
2. Pass 2로 path/file policy를 정리해 이후 server/client 작업의 기준을 맞춘다.
3. Pass 3, Pass 4를 server/agent worker가 각각 진행한다.
4. Pass 5, Pass 6, Pass 7을 client/renderer worker가 병렬로 진행하되
   streaming과 renderer host는 같은 PR에 섞지 않는다.
5. Pass 8은 template UX 또는 project creation 변경과 별도 PR로 진행한다.

각 PR은 동작 보존 PR이어야 한다. 한 PR 안에서 refactor와 behavior change를
섞어야 한다면 먼저 이 문서에 계약 변경 후보를 추가하고, 필요하면 ADR로
승격한다.

## PR 본문용 요약

- modernization/refactor fan-out 전에 보존해야 할 계약과 후보 영역을 문서화했다.
- dead code, duplicated paths, oversized modules, stale abstractions,
  legacy patterns를 제거 대상이 아니라 검증 가능한 proposed pass로 분류했다.
- 각 pass에 현재 동작, 구조 개선 방향, 검증 체크를 명시해 후속 PR들이 같은
  기준으로 나뉘도록 했다.
