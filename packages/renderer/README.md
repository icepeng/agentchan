# `@agentchan/renderer`

renderer 도메인의 **단일 출처**다. 작성자(authoring) 표면과 호스트 빌드(host
build) 표면을 한 패키지에서 같이 소유하며, 다른 패키지가 SDK source를
미러링하지 않는다.

`private: true`. 외부 배포 대상이 아니라 monorepo 내부 의존이다.

## 공개 subpath

| Import path | 용도 | 소비자 |
| --- | --- | --- |
| `@agentchan/renderer/core` | 작성자 core SDK (`defineRenderer`, `fileUrl`, `isRendererRuntime`, contract 타입) | 프로젝트 `renderer/index.ts(x)`, webui client (`RendererSnapshot`/`Actions`/`Theme`/`ThemeTokens` 등) |
| `@agentchan/renderer/react` | React authoring adapter (`createRenderer`, `RendererProps`) | 프로젝트 `renderer/index.tsx` |
| `@agentchan/renderer/build` | 호스트 빌드 파이프라인 (`buildRendererBundle`, `findRendererEntrypoint`, `RendererBundle`, `RendererV1Error`, `RendererBuildError`, Bun plugin) | webui server (`project.service.ts`) |

## 작성자 surface vs 호스트 빌드

- 작성자 surface (`/core`, `/react`)는 ADR-0001의 contract를 구현한다. 사용자
  프로젝트의 `renderer/` 디렉토리가 import하는 유일한 패키지 경로다.
- 호스트 빌드 (`/build`)는 사용자 renderer를 ESM 번들로 빌드한다. Bun
  builder에 import policy validator + `agentchan-renderer` Bun plugin을
  꽂아 `@agentchan/renderer/{core,react}`를 같은 패키지의 디스크 경로로 직접
  resolve한다. 별도의 SDK source 미러는 두지 않는다.

## SDK source 단일 출처

`/core`와 `/react`의 source는 `src/core.ts`, `src/react.tsx` 두 파일이 전부다.
호스트 빌드는 이 파일을 그대로 resolve해서 번들에 넣는다. 빌더 측에 SDK
shim/string-mirror을 두지 않으므로 contract 변경 시 동기화할 두 번째 출처가
없다.

## Out of scope

이 패키지가 책임지지 **않는** 것:

- Renderer presentation machine (fade-out → import → mount → fade-in 라이프사이클).
  webui의 `apps/webui/src/client/features/project/renderer-host/`에서 소유.
- Agent state, session, compaction 등 agent runtime. `@agentchan/creative-agent`에서 소유.
- Renderer bundle 서빙 HTTP 계층. `apps/webui/src/server/`에서 소유.
- 런타임 dependency 설치 자체 (`AGENTCHAN_RENDERER_RUNTIME_DIR` 디렉토리에
  사용자가 직접 `bun install`해서 둠). 이 패키지는 resolve만 한다.

## 환경변수

- `AGENTCHAN_RENDERER_RUNTIME_DIR` — host runtime/experimental dependency를
  resolve할 디렉토리. 미설정 시 실행 파일과 같은 디렉토리의 `renderer-runtime/`.
- `AGENTCHAN_RENDERER_EXPERIMENTAL_DEPS` — `"1"`이면 사용자가 위 디렉토리에
  추가 설치한 deps를 import policy/builder가 허용한다.

## 테스트

```sh
bun run --cwd packages/renderer test
```

`tests/build/`에는 entrypoint detection, import policy, bundle 산출물 동작을
검증하는 케이스가 있다.
