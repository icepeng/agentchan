# ADR 0001: 렌더러는 React 기반의 주 화면이다

Status: Accepted  
Date: 2026-04-25

## Context

Agentchan의 renderer는 보조 extension mount가 아니라 사용자가 가장 오래
보는 프로젝트 주 화면이다. 과거 HTML string renderer는 DOM morphing,
inline script 재실행, event listener cleanup, stable id 규칙을 템플릿
작성자가 직접 맞춰야 했다.

현재 코드 기준 renderer runtime은 `renderer/index.tsx`를 entrypoint로
받아 Bun build로 browser ESM bundle을 만들고, Web UI가 Blob import 후
React root와 ShadowRoot 안에 mount한다.

## Decision

Renderer V1의 공개 작성 계약은 React-first이며 React-only이다.

프로젝트 renderer는 `renderer/index.tsx`에 작성하고 React component를
default export한다. 선택적으로 `theme(snapshot)` named export를 제공한다.

```tsx
/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";

export default function Renderer({ snapshot, actions }: Agentchan.RendererProps) {
  return <main>...</main>;
}

export function theme(snapshot: Agentchan.RendererSnapshot): Agentchan.RendererTheme {
  return { base: { accent: "#3d7a6d" } };
}
```

공개 surface는 다음으로 제한한다.

- `Renderer({ snapshot, actions })`
- `theme(snapshot)`
- `Agentchan.fileUrl(snapshot, fileOrPath)`
- `agentchan:renderer/v1`
- `react`
- `renderer/` 내부 relative import와 CSS import
- React 19 metadata/resource `<link>` 태그 중 `rel="stylesheet"`와
  `rel="preconnect"`로 선언한 외부 스타일시트/폰트 리소스

`RendererSnapshot`은 `{ slug, baseUrl, files, state }`다. `ProjectFile`의
`digest`는 opaque cache identity다. Renderer-visible
`state.pendingToolCalls`는 string array다.

Host lifecycle, snapshot subscription, ShadowRoot, Blob import, future iframe
transport는 runtime 구현 세부사항이며 renderer 작성 API가 아니다.

## Consequences

- committed template은 React component renderer를 작성한다.
- HTML string renderer, host-side script re-execution, renderer-owned
  lifecycle hook을 주 작성 경로로 되살리지 않는다.
- animation/state continuity는 stable component type, stable key, local
  state, effect로 유지한다.
- renderer import policy는 `agentchan:renderer/v1`, `react`, `renderer/`
  내부 relative import, CSS import로 제한한다.
- renderer code는 host DOM global, browser storage, `node:*`, 외부 URL import,
  임의 npm package에 의존하지 않는다.
- 외부 폰트는 React 19 `<link rel="stylesheet" precedence="...">`와
  `<link rel="preconnect">`로 선언할 수 있다. Host CSP가 허용한 origin만
  로드된다. 외부 stylesheet의 selector가 ShadowRoot 내부 DOM을 스타일링한다고
  가정하지 말고, font-face 등록 용도로 사용한다.
- 파일 URL은 가능하면 `Agentchan.fileUrl()`을 사용해 digest cache key를
  일관되게 붙인다.

## Reconsider When

- committed template에 React component로 합리적으로 감쌀 수 없는 renderer가
  필요하다.
- third-party renderer package를 독립 release cycle로 지원해야 한다.
- 보안 요구사항 때문에 iframe sandboxing이 필요하고 React component 계약을
  message passing 위에서 보존할 수 없다.
