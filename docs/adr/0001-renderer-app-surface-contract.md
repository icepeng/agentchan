# ADR 0001: 렌더러는 프로젝트 앱 표면으로 실행된다

상태: 승인됨
날짜: 2026-04-26

## 맥락

Agentchan의 렌더러는 보조 미리보기가 아니라 사용자가 가장 오래 보는 프로젝트
표면이다. 과거 HTML 문자열 렌더러는 DOM morphing, inline script 재실행,
event listener cleanup, stable id 규칙을 템플릿 작성자가 직접 맞춰야 했다.

첫 Renderer V1 초안은 `renderer/index.tsx`의 React component default export를
Web UI의 React root 안에 mount했다. 이 방식은 단순한 React view에는 작동하지만
작성 계약이 host 구현 세부사항에 묶인다. 나중에 iframe, 다른 JS realm,
renderer-specific dependency resolver, `@react-three/fiber` 같은 별도 reconciler가
필요해지면 renderer source를 다시 고쳐야 하는 구조다.

특히 host React tree가 renderer component를 직접 render하면 React runtime identity와
reconciler boundary가 host에 묶인다. 고급 사용자가 나중에 renderer-specific
dependency를 직접 실험하거나, 제품이 dependency resolver를 확장하더라도 이 경계가
남아 있으면 invalid hook call, reconciler mismatch, context mismatch 같은 문제가
다시 생길 수 있다.

반대로 iframe document, project-local `package.json`, dependency install을 지금
필수 계약으로 올리면 사용자에게 package manager 개념이 노출되고 구현 범위가
과도하게 커진다. 현재 필요한 결정은 renderer 작성자가 의존할 공개 surface를
낮은 lifecycle boundary로 고정하고, runtime backend는 제품이 바꿀 수 있게 두는
것이다.

## 결정

Renderer V1은 project-specific app surface다. 공개 작성 API는 adapter 기반이고,
host 내부 실행 방식은 구현 세부사항이다.

Renderer 작성자는 `renderer/index.ts` 또는 `renderer/index.tsx`에서 named export
`renderer`를 제공한다. Default export는 Renderer V1 계약에 포함하지 않는다.

React renderer는 다음처럼 작성한다.

```tsx
import { createRenderer } from "@agentchan/renderer/react";

export const renderer = createRenderer(
  function Renderer({ snapshot, actions }) {
    return <main>...</main>;
  },
  {
    theme(snapshot) {
      return { base: { accent: "#3d7a6d" } };
    },
  },
);
```

Vanilla renderer는 다음처럼 작성할 수 있다.

```ts
import { defineRenderer } from "@agentchan/renderer/core";

export const renderer = defineRenderer(
  ({ container, snapshot, actions }) => {
    container.textContent = snapshot.slug;
    return {
      update(nextSnapshot) {
        container.textContent = nextSnapshot.slug;
      },
      unmount() {},
    };
  },
  {
    theme(snapshot) {
      return null;
    },
  },
);
```

Adapter가 생성하는 host-facing contract는 다음 형태다.

```ts
interface RendererModule {
  renderer: RendererRuntime;
}

interface RendererRuntime {
  mount(container: HTMLElement, bridge: RendererBridge): RendererInstance;
  theme?(snapshot: RendererSnapshot): RendererTheme | null;
}

interface RendererInstance {
  update(snapshot: RendererSnapshot): void;
  unmount(): void;
}
```

`mount/update/unmount/theme`는 대부분의 템플릿 작성자가 직접 구현하는 주 API가
아니다. `createRenderer()`와 `defineRenderer()`가 만드는 낮은 runtime contract다.
Adapter가 실패할 때 오류는 adapter 내부 구현이 아니라 이 lifecycle contract와
renderer entrypoint 관점에서 설명되어야 한다.

`@agentchan/renderer/core`는 Renderer V1의 core contract, 타입, `defineRenderer()`,
`fileUrl()` 같은 pure helper를 제공한다. React에 의존하지 않는다.

`@agentchan/renderer/react`는 React authoring adapter인 `createRenderer()`를
제공하고, core의 타입과 pure helper를 re-export한다.

React adapter runtime은 host React tree 안에 renderer component를 직접 render하지
않는다. 현재 backend가 host document와 ShadowRoot를 사용하더라도 renderer module의
`mount()`가 별도 React root를 소유하고, snapshot 변경은 host props가 아니라
`RendererInstance.update(snapshot)`으로 전달한다.

`agentchan:renderer/v1` 같은 Agentchan 전용 virtual module은 공개 작성 계약에
포함하지 않는다. 현재 host build가 package subpath를 내부 SDK source로 alias할 수
있지만, renderer source가 의존하는 specifier는 실제 package 형태인
`@agentchan/renderer/core`와 `@agentchan/renderer/react`다.

Runtime backend는 V1 공개 계약이 아니다. 현재 구현은 host document의 ShadowRoot와
React root를 사용할 수 있다. 이후 iframe, worker-like bridge, project-local
dependency resolver로 바꿔도 renderer source는 같은 `renderer` named export와
adapter import를 유지해야 한다.

## 공개 표면

Renderer 작성자가 의존할 수 있는 안정 surface는 다음이다.

- `@agentchan/renderer/core`
- `@agentchan/renderer/react`
- `defineRenderer(factory)` from `@agentchan/renderer/core`
- `createRenderer(Component)` from `@agentchan/renderer/react`
- `fileUrl(snapshot, fileOrPath, options?)`
- pure snapshot/file helpers exported by core and re-exported by React adapter
- required named export `renderer`
- optional `theme(snapshot)` option on `createRenderer()` / `defineRenderer()`
- `RendererSnapshot`
- `RendererActions`
- `renderer/` 내부 relative imports와 CSS imports

`RendererSnapshot`은 `{ slug, baseUrl, files, state }`다. `ProjectFile.digest`는
opaque cache identity다. File object identity는 가능한 한 유지하되, renderer는
`path`, `modifiedAt`, `digest`를 재사용 판단의 안정 기준으로 삼는다.

`RendererActions`는 선언적 snapshot으로 표현할 수 없는 command만 포함한다. V1의
기본 action은 `fill`, `send` 같은 agent interaction command로 제한한다.

## 런타임 경계

Renderer는 host Web UI의 내부 DOM, React tree, routing, storage, session
implementation에 의존하지 않는다. 구체적으로 다음은 Renderer V1 계약 밖이다.

- host DOM 구조
- ShadowRoot 존재 여부
- iframe 사용 여부
- `window.parent` / `window.top`
- browser storage
- arbitrary network access
- runtime import of arbitrary npm packages
- server session API polling
- host React identity나 reconciler identity

Renderer 작성 코드는 현재 backend가 same-document ShadowRoot로 실행되더라도 iframe
전환 가능성을 보존해야 한다.

- DOM 작업은 adapter가 전달한 `container`와 그 하위 tree를 기준으로 한다.
- 문서 수준 API가 필요하면 `container.ownerDocument`를 기준으로 삼고, host document
  identity에 의존하지 않는다.
- `window.parent`, `window.top`, host query selector, host CSS variable, host global
  store에 의존하지 않는다.
- Renderer와 host 사이의 통신은 `RendererSnapshot`, `RendererActions`, renderer
  runtime의 `theme(snapshot)` capability로만 표현한다.
- Host는 renderer mount lifetime 동안 같은 `RendererActions` object identity를
  유지한다. Renderer는 action closure를 mount 시점에 캡처할 수 있다.
- Snapshot과 action payload는 structured-clone 가능한 JSON-like 값으로 유지한다.
- 파일과 asset은 host DOM path나 relative server path를 추측하지 않고
  `fileUrl(snapshot, fileOrPath)`로 참조한다.
- viewport, focus, keyboard, pointer interaction은 renderer root가 소유한다는
  전제에서 작성하되, host shell 바깥 DOM을 조작하지 않는다.

Host Web UI는 session, streaming, branch, editor dirty state, notifications를
소유한다. Renderer는 host가 제공하는 snapshot과 `RendererActions`를 소비한다.
큰 파일, image, texture, glTF 같은 asset은 `fileUrl(snapshot, file)`로 얻은 URL을
fetch한다.

Renderer dependency install은 V1 공개 계약이 아니다. Stable renderer source의 bare
import는 `@agentchan/renderer/core`, `@agentchan/renderer/react`, `react`,
`react-dom/client`로 제한한다. 그 밖의 코드는 `renderer/` 내부 relative import와 CSS
import로 구성한다.

Compiled executable은 renderer bundling에 필요한 baseline React package를 내부
sidecar로 포함할 수 있다. 이 `renderer-runtime/` sidecar는 host implementation
detail이며 project별 dependency sandbox가 아니다. Source repository는
`renderer-runtime/node_modules`를 track하지 않고, release builder가
`bun install --frozen-lockfile`로 재현해 포함하는 generated artifact로 취급한다.
첫 boot에서 자동 install을 수행하지 않는다.

`@react-three/fiber`, `three` 같은 추가 renderer dependency는 V1 stable surface가
아니다. 필요한 검증은 `AGENTCHAN_RENDERER_EXPERIMENTAL_DEPS=1`과
`AGENTCHAN_RENDERER_RUNTIME_DIR`로 분리한 lab runtime에서 수행할 수 있다. 이 경로는
제품 계약이 아니라 future capability 검증용 escape hatch다.

## 결과

- Renderer source는 더 이상 default-export React component를 public contract로
  노출하지 않는다.
- Host React tree는 renderer component를 직접 render하지 않는다. React renderer는
  adapter가 소유하는 별도 React root에서 실행된다.
- Renderer SDK specifier는 virtual module이 아니라 package 형태를 사용한다.
- 계약 표면은 lifecycle boundary로 낮아지고, authoring 편의와 runtime 복잡도는
  `@agentchan/renderer` adapter가 흡수한다.
- `/v1` subpath는 사용하지 않는다. Breaking authoring change가 실제로 필요할 때만
  새 subpath를 검토하고, 일반 backend 변경은 같은 import surface 아래에서 처리한다.
- Runtime backend는 제품 내부 구현으로 남는다. ShadowRoot-only runtime은 현재
  implementation path일 수 있지만 보존해야 할 public contract가 아니다.
- Iframe은 future backend option이다. 필요해질 때 renderer source 변경 없이
  도입할 수 있어야 한다.
- Project-local `package.json`, `bun.lock`, dependency install은 V1 stable 계약이
  아니다. 추가 renderer dependency는 experimental lab path에서만 검증한다.
- Web UI는 workspace shell로 남는다. Template 생성, project 전환, Explorer/files,
  renderer preview, fallback/debug interaction은 host에 남긴다.
- 장기적으로 renderer는 더 창의적인 project experience를 위해 chat affordance를
  흡수할 수 있다. 이는 capability 방향성이지 모든 renderer의 요구사항이 아니다.
- Direct server session ownership과 headless chat/agent panel component는 future
  capability다. V1은 renderer가 streaming, branching, chat persistence, server
  session API를 구현하도록 요구하지 않는다.

## 재검토 조건

- 위 iframe-compatible authoring constraints를 지킨 renderer도 source 변경 없이
  iframe backend에서 실행할 수 없을 때.
- `@react-three/fiber`, `three` 같은 추가 dependency가 primary renderer use case가
  되어 stable dependency resolver나 project별 dependency isolation이 필요해질 때.
- Snapshot push 비용이 커져 pull/delta protocol이 필요할 때.
- Host Web UI shell 책임이 충분히 줄어 headless Agentchan backend와 renderer-owned
  app shell이 primary product mode가 되어야 할 때.
- Renderer-owned chat이 충분히 일반화되어 `host-snapshot`을 `direct-server`
  runtime mode로 보완해야 할 때.
