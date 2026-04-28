# renderer-surface

webui 클라이언트가 프로젝트 페이지에서 renderer를 mount하고 lifecycle을
조율하는 page-level orchestrator. Renderer 작성자 코드는 들어가지 않는다.

## 5 책임 모듈 경계

```
RenderedView (orchestrator)
  ├── useRendererSurfaceMachine     ── State Machine (use-surface-machine/)
  │       ├── transitions           ── status -> CSS class, fade timing
  │       └── theme-identity        ── theme 함수 평가 + identity 비교
  └── ShadowShell                   ── ShadowRoot Shell (DOM 격리 캡슐)
          └── shadow-runtime        ── ShadowRoot WeakMap, mount 노드 helper

useRendererOutput (entities/renderer)
  ├── snapshot/toSnapshot           ── Snapshot Binder (agent state -> snapshot)
  └── bundle/                       ── Bundle Loader
        ├── importer                ──   js Blob -> ESM dynamic import
        ├── sameBundle              ──   bundle 동등 비교
        └── (fetch는 entities/project)
```

| 책임 | 위치 | 핵심 export |
|---|---|---|
| Bundle Loader | `entities/renderer/bundle/` | `importRendererModule`, `sameBundle`, `RendererModule` |
| Snapshot Binder | `entities/renderer/snapshot/` | `buildRendererSnapshot`, `toRendererAgentState`, `reuseStableFiles` |
| Theme Resolver | `entities/renderer/theme/` | `validateTheme`, `resolveThemeVars` |
| ShadowRoot Shell | `features/project/renderer-surface/ShadowShell.tsx`, `shadow-runtime.ts` | `ShadowShell`, `ShadowShellHandle`, `getShadowRuntime` |
| State Machine | `features/project/renderer-surface/use-surface-machine/` | `useRendererSurfaceMachine` |

## 어휘 규칙 (G1 이후)

- **shell**: DOM 격리 캡슐(ShadowRoot 컨테이너). React Component는 `ShadowShell`.
- **surface**: 페이지에서 renderer를 띄우는 orchestrator 영역.
  `renderer-surface/` 폴더가 그것.
- **runtime**: ShadowRoot 인스턴스 상태(`ShadowRuntime`)와 baseline 사이드카
  (`renderer-runtime/`)에만 쓴다.
- **instance**: SDK `RendererInstance` mount 결과. 변경 금지.

## State Machine

`useRendererSurfaceMachine`이 다음 7-state statechart를 구현한다.

```
stable -> fading-out -> waiting-for-import -> applying-theme -> mounting -> fading-in -> stable
                                                                              \
                                                                               +--> showing-error
```

- Import는 `fading-out` 동안 병행 진행. Pending theme은 `fading-out`이 끝난
  뒤에 적용한다.
- Mount는 `applying-theme` 윈도우(300ms) 후에 일어난다.
- Fade duration은 `transitions.ts`의 `FADE_OUT_MS`(300), `THEME_TRANSITION_MS`(300),
  `FADE_IN_MS`(200). CSS `duration-200`과 동기화.

## 불변 사항

- ShadowShell은 host DOM 격리를 보장한다. Renderer는 `container` 하위만
  조작한다. (ADR 0001)
- Host는 mount lifetime 동안 `RendererActions` object identity를 유지한다.
- Snapshot/action payload는 structured-clone 가능한 JSON-like.
- Renderer는 host의 React tree, routing, storage에 접근하지 않는다.

## 단위 테스트

순수 함수만 단위 테스트한다. ShadowShell과 hook orchestrator는 React+DOM
비용이 커서 수동 시나리오로 검증.

- `theme/__tests__/resolve.test.ts`
- `theme/__tests__/validate.test.ts`
- `bundle/__tests__/sameBundle.test.ts`
- `snapshot/__tests__/toSnapshot.test.ts`
- `use-surface-machine/__tests__/class-for-status.test.ts`
