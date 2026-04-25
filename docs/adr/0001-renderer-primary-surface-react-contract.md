# ADR 0001: 렌더러는 React 기반의 주 화면이다

Status: Accepted  
Date: 2026-04-25

## Context

렌더러는 사용자가 가장 오래 머무는 주 화면이다. 보조 확장 패널이
아니다. 초기 Renderer V1 초안은 템플릿이 lifecycle 세부사항을 직접
다루는 범용 renderer module 계약을 검토했다. 그 방식은 런타임을
유연하게 만들 수 있지만, 템플릿 코드에 lifecycle 복잡도를 떠넘긴다.

기존 템플릿은 이 문제가 실제로 발생한다는 것을 보여줬다. HTML 문자열
렌더러는 DOM morphing, inline script 우회, listener cleanup 규칙에
의존했다. 범용 lifecycle 계약을 유지하면 제품의 주 화면 품질보다
가상의 framework 다양성을 우선하게 된다.

대부분의 제품은 이런 중간 지대를 피한다. 제한된 선언형 UI를 제공하거나,
하나의 framework/component model을 선택하거나, iframe/webview 경계를
두고 message passing을 사용한다. Agentchan은 지금 주 authoring model을
선택하고, 나중에 runtime transport를 교체할 수 있게 유지한다.

## Decision

Renderer V1의 공개 작성 계약은 React-first이며 React-only이다.

프로젝트 렌더러는 `renderer/index.tsx`에 작성하고 React component를
default export한다.

```tsx
import { Agentchan } from "agentchan:renderer/v1";

export default function Renderer({ snapshot, actions }: Agentchan.RendererProps) {
  return <main>...</main>;
}

export function theme(snapshot: Agentchan.RendererSnapshot): Agentchan.RendererTheme {
  return { base: { accent: "#3d7a6d" } };
}
```

공개 renderer surface는 다음으로 제한한다.

- `Renderer({ snapshot, actions })`
- 선택적 named export `theme(snapshot)`
- `Agentchan.fileUrl(snapshot, fileOrPath)`
- `agentchan:renderer/v1`의 type helper
- `renderer/` 내부 relative import와 CSS import

Host lifecycle, snapshot subscription, ShadowRoot, iframe, Blob import,
message transport는 runtime 구현 세부사항이다. 렌더러 작성 API의 일부가
아니다.

## Consequences

향후 renderer 작업은 다음 성질을 유지해야 한다.

- 템플릿은 HTML 문자열이나 template-owned lifecycle hook 주변에 adapter
  작성 경로를 추가하지 말고 React component로 전환한다.
- 이후 ADR이 이 결정을 바꾸기 전까지 committed template 지침에 범용
  renderer-module 작성 경로를 추가하지 않는다.
- inline `<script>` output, host-side script re-execution, renderer HTML
  string morphing을 주 작성 경로로 되살리지 않는다.
- 렌더러 state와 animation continuity는 React 방식으로 유지한다:
  stable component type, stable key, local state, effect.
- iframe 이전 가능성을 유지한다. snapshot은 serializable shape로 유지하고,
  action은 async-safe하게 다루며, 파일 접근은 `Agentchan.fileUrl`을
  거치고, renderer code는 host DOM global에 의존하지 않는다.

Runtime code는 React renderer를 load/dispose하기 위해 내부 lifecycle
함수를 사용할 수 있다. 그 구조는 공개 템플릿 계약이 아니다.

## Reconsider When

다음 중 하나가 실제 요구가 될 때만 이 ADR을 재검토한다.

- committed template에 React component와 `ref`/effect로 합리적으로 감쌀 수
  없는 non-React renderer가 필요하다.
- Agentchan이 독립 release cycle과 framework 선택권을 가진 third-party
  renderer package를 지원하기 시작한다.
- 보안 요구사항 때문에 iframe sandboxing이 필요하고, React component
  계약을 message passing 위에서 보존할 수 없다.
- custom React surface보다 제한된 선언형 UI가 더 가치 있어진다.
