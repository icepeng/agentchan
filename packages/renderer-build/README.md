# @agentchan/renderer-build

Renderer V1의 **빌드 타임 도구**. 프로젝트 디렉토리의 `renderer/index.ts`
또는 `renderer/index.tsx`를 단일 ESM 번들로 컴파일한다.

## 책임

- `findRendererEntrypoint(projectDir)`: 프로젝트의 renderer entrypoint 탐색.
- `validateRendererImportPolicy(entrypoint, rendererDir)`: 허용 specifier
  whitelist + host leak 방지.
- `buildRendererBundle(projectDir)`: Bun.build로 ESM 단일 번들 생성. 결과
  shape는 `@agentchan/renderer/core`의 `RendererBundle` (`{ js: string; css: string[] }`).

호출처는 webui server `apps/webui/src/server/services/project.service.ts`
하나뿐이다. agent runtime은 이 패키지를 import하지 않는다.

## SDK와의 관계

작성자 surface SDK인 `@agentchan/renderer/{core,react}`(`packages/renderer/`)는
이 패키지에 의존하지 않는다. **반대로** 본 패키지가 SDK 소스를 인라인 미러로
보유한다(`plugins/sdk-shim.ts`의 `RENDERER_CORE_SOURCE`,
`RENDERER_REACT_SOURCE`). 사용자 renderer가 SDK를 import하면 이 미러가
번들에 인라인된다.

미러는 SDK 원본과 **동기화되어야 한다**. drift는 `tests/builder.test.ts`의
SDK ↔ 원본 equivalence 테스트가 잡는다. SDK 원본을 수정한 PR은 본 패키지의
미러도 함께 수정해야 한다.

## 구조

```
src/
  index.ts          # 외부 export 진입점
  builder.ts        # findRendererEntrypoint, buildRendererBundle
  errors.ts         # RendererV1Error, RendererBuildError
  policy.ts         # validateRendererImportPolicy + import specifier 검사
  runtime-deps.ts   # AGENTCHAN_RENDERER_RUNTIME_DIR / _EXPERIMENTAL_DEPS env
  plugins/
    index.ts        # createRendererRuntimePlugin + createRendererSourcePlugin re-export
    sdk-shim.ts     # SDK alias plugin + 인라인 미러
    source-loader.ts # JSX pragma 주입 plugin
    host-runtime.ts # react/scheduler 사이드카 resolve helper
tests/
  builder.test.ts   # SDK equivalence + policy 위반 + entrypoint 탐색
```

## 추가 plugin 또는 의존성

추가 renderer bare dependency는 stable 계약이 아니다. `r3f`, `three` 등
실험적 의존성 검증은 `AGENTCHAN_RENDERER_EXPERIMENTAL_DEPS=1`과
`AGENTCHAN_RENDERER_RUNTIME_DIR`을 사용하는 lab path에서만 다룬다.

## 테스트

`bun test` 또는 monorepo root에서 `bun run test`. 변경 시 SDK shim
equivalence 테스트가 통과하는지 우선 확인한다.
