# `@agentchan/renderer`

renderer 도메인의 **단일 출처**다. 작성자(authoring) 표면과 호스트 빌드(host
build) 표면을 한 패키지에서 같이 소유하며, 다른 패키지가 SDK source를
미러링하지 않는다.

`private: true`. 외부 배포 대상이 아니라 monorepo 내부 의존이다.

## 공개 subpath

| Import path | 용도 | 소비자 |
| --- | --- | --- |
| `@agentchan/renderer/react` | 작성자 유일 공개 표면 (`createRenderer`, `fileUrl`, contract 타입) | 프로젝트 `renderer/index.tsx` |
| `@agentchan/renderer/host` | 호스트 orchestrator 표면 (`isRendererRuntime`, `RendererRuntime`/`Bridge`/`Instance`, `RendererBundle`, snapshot/theme 타입) | webui client (`renderer-host`, `entities/renderer`) |
| `@agentchan/renderer/internal` | message protocol 및 cross-cutting types (host와 iframe shell이 공유) | host orchestrator, iframe shell |
| `@agentchan/renderer/iframe-bootstrap` | iframe shell entry placeholder (PRD #176 Slice 3에서 본격 사용) | iframe document |
| `@agentchan/renderer/build` | 호스트 빌드 파이프라인 (`buildRendererBundle`, `findRendererEntrypoint`, `RendererError`, `RendererBuildError`, Bun plugin). conditional `node` only — 브라우저 환경에서는 resolve되지 않는다 | webui server (`project.service.ts`) |

## 작성자 surface vs 호스트 빌드

- 작성자 surface (`/react`)는 ADR-0001의 contract를 구현한다. 사용자
  프로젝트의 `renderer/` 디렉토리가 import하는 유일한 패키지 경로다.
- 호스트 빌드 (`/build`)는 사용자 renderer를 ESM 번들로 빌드한다. Bun
  builder에 import policy validator + `agentchan-renderer` Bun plugin을
  꽂아 `@agentchan/renderer/react`를 같은 패키지의 디스크 경로로 직접
  resolve한다. 별도의 SDK source 미러는 두지 않는다.

### 핵심 export 요약 (`/react`)

- `createRenderer(Component, options)` — React 컴포넌트를 Renderer runtime으로 감싼다.
- `fileUrl(snapshot, file)` — `files/` 자원 URL을 digest cache-bust 포함해 만든다.
- `useAutoScroll(options?)` — stick-to-bottom hook. `scrollRef`를 컨테이너에 붙이면 mount 시 bottom으로 점프, 사용자가 bottom 근처일 때만 자동 추적. `isAtBottom`, `scrollToBottom(behavior?)` 노출.
- 타입: `AgentState`, `RendererSnapshot`, `RendererActions`, `RendererProps`, `RendererTheme`, `ProjectFile`, `AssistantContentBlock`, `ToolCall`, `ToolResultMessage`, …
  - `snapshot.state`는 canonical `AgentState`. `pendingToolCalls`는 `ReadonlySet<string>`이므로 `.has(id)`로 조회한다.
  - `RendererTheme`은 Host가 Project 채팅 UI에 적용하는 **Project theme**이다. App theme만 쓰는 renderer는 `createRenderer(Component)`를 사용하고 `theme` option을 넘기지 않는다. Project theme을 제공할 때만 `theme(snapshot)`을 사용하며, 반환 모양은 `{ light?, dark? }`로 둘 중 최소 하나에 `void`, `base`, `surface`, `elevated`, `accent`, `fg`, `fg2`, `fg3`, `fg4`, `edge` 전체를 담는다. 둘 다 담으면 user Appearance 토글이 살아 있고, 하나만 담으면 chat scope에서 해당 scheme으로 잠긴다. Host fallback token에는 font token도 있지만 `RendererTheme`은 font를 받지 않는다. 양쪽에 모두 존재하는 이름은 같은 의미로 맞춘다.
  - Renderer CSS에서 Host fallback token은 `--agentchan-default-*`로 읽는다. 기본값만 쓰는 renderer는 rule에서 직접 읽고, Renderer가 소유하는 CSS variable은 `--agentchan-renderer-*`로 단일 `:root` block에 선언한다. 이 namespace는 Project theme으로 Host에 전달하는 color에 한정되지 않는다. Renderer가 스스로 소비하는 추가 color, spacing, radius, shadow, motion, layout 값도 둘 수 있다. Renderer가 소유하는 color 값은 App theme과 같은 hex라도 직접 선언하고, font처럼 Host 기본값 일부를 차용하는 값만 같은 block 안에서 `var(--agentchan-default-font-*)`로 alias한다. Web UI 내부 `--color-*`, `--font-family-*` variables는 작성자 contract가 아니다.

## SDK source 단일 출처

`/react`의 source는 `src/react.tsx`가 전부이며 `src/internal.ts`에 정의된
cross-cutting 타입을 re-export한다. 호스트 빌드는 이 파일들을 그대로
resolve해서 번들에 넣는다. 빌더 측에 SDK shim/string-mirror을 두지 않으므로
contract 변경 시 동기화할 두 번째 출처가 없다.

## Baseline React vendor

5개 baseline specifier — `react`, `react-dom/client`, `react/jsx-runtime`,
`react/jsx-dev-runtime`, `scheduler` — 는 호스트 빌드가 **inline하지 않고**
ESM external로 둔다(`policy.ts`의 `EXTERNAL_VENDOR_SPECIFIERS`). 호스트
document의 importmap이 이 specifier들을 install-wide vendor fixture로 resolve
한다. fixture 자체는 `@agentchan/renderer-vendor`가 빌드해서 emit한다.

이 5개는 product invariant다. 작성자가 다른 bare import로 우회할 수 없다 —
정책 validator가 reject한다.

## Out of scope

이 패키지가 책임지지 **않는** 것:

- Renderer presentation machine (fade-out → import → mount → fade-in 라이프사이클).
  webui의 `apps/webui/src/client/features/project/renderer-host/`에서 소유.
- Agent state, session, compaction 등 agent runtime. `@agentchan/creative-agent`에서 소유.
- Renderer bundle 서빙 HTTP 계층. `apps/webui/src/server/`에서 소유.
- Baseline React vendor fixture 빌드 자체. `@agentchan/renderer-vendor`에서 소유.

## 테스트

```sh
bun run --cwd packages/renderer test
```

`tests/build/`에는 entrypoint detection, import policy, bundle 산출물 동작과
baseline vendor specifier externalization을 검증하는 케이스가 있다.
