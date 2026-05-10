# Renderer 작성 계약

Renderer entrypoint는 `renderer/index.ts` 또는 `renderer/index.tsx`이며, named export `renderer = createRenderer(Renderer, { theme })`를 제공한다. 작성자가 의존하는 공개 API는 `@agentchan/renderer/react` 단일 패키지다.

Host는 host server가 serve하는 정적 shell HTML(`/renderer-shell.html`) 위에 iframe document를 mount하고, transferred MessagePort 위 agentchan renderer RPC envelope로 양방향 통신한다. iframe은 author bundle의 첫 React commit 직후 `host.mounted({ theme })`를 호출하고, host는 이 ack을 받기 전에는 새 iframe content를 사용자에게 노출하지 않는다.

Author component는 `{ snapshot: RendererSnapshot, actions: RendererActions }`를 props로 받는다. `snapshot.state`는 host와 iframe이 동일한 `applyAgentEvent` reducer로 AgentEvent를 fold한 결과이며, host는 frame마다 snapshot 전체를 직렬화하지 않는다. `snapshot.baseUrl`은 host origin을 포함한 절대 URL이다.

Theme은 renderer가 host에 `onTheme(theme)`로 push한다. Host는 자기 appearance만 반영한 고정 테마 variables를 iframe에 전달하며, renderer가 push한 dynamic theme은 iframe에 되돌려 보내지 않는다. iframe document의 reset CSS는 host의 preflight를 inline으로 받는다. iframe은 `data-theme` attribute로 light/dark를 구분하고, 두 scheme의 variable 블록을 동일 selector 아래 선언한다. Scroll은 renderer가 소유한다.

Renderer bundle은 host server가 `/api/projects/{slug}/renderer.js?v={digest}`에 serve하고, iframe은 자기 origin에서 dynamic import한다. iframe document, bundle, host theme stylesheet은 모두 host와 같은 origin에서 시작하지만, 향후 iframe sandbox 또는 cross-origin 전환을 막지 않는다. Host와 iframe은 공유 객체, globals, storage를 통해 통신하지 않으며, 자원 URL은 host origin을 포함한 절대 형태로 전달한다.

## Motivation

Storybook, VS Code webview, Codepen, Codesandbox, Figma plugin 등 외부 작성 코드를 호스트 앱에서 분리하는 방식은 iframe 격리로 수렴한다. plugin renderer가 표준적으로 채택하는 격리 형태를 그대로 도입한다.

## Considered Options

- **Renderer JS를 host가 만든 blob URL로 전달**: 가장 적은 변경이지만 iframe sandbox 또는 cross-origin 전환 시 blob URL 접근이 막히고, source map / stack trace가 망가져 third-party author 작업이 손상된다.
- **Static theme feed에 dynamic-applied variables 포함**: host가 적용한 dynamic theme이 다시 iframe static feed로 들어가는 사이클을 만든다.
- **Author API에 AgentEvent stream 직접 노출**: snapshot reduce를 author가 작성한다. 모든 templates에 reducer 중복 부담.
- **`snapshot.baseUrl`을 host-relative 경로로 유지**: iframe origin 기준으로 resolve돼 sandbox 전환 시 깨진다.

## Consequences

- Renderer가 사용하는 `100vh`/`100dvh`는 iframe document를 가리킨다. host viewport 의미가 아니다.
- Mount transition 동안 두 iframe element가 한 시점에 공존한다.
- Bundle은 client-side blob에서 host server route로 이동하며, 신규 route가 추가된다.
- `applyAgentEvent`와 `AgentState`는 `@agentchan/creative-agent/browser` subpath가 owning한다. host와 iframe-side adapter 양쪽이 같은 함수를 import한다.
- 사용자 appearance 토글은 iframe의 `data-theme` attribute 갱신만으로 반영되며, 별도 stylesheet push가 필요 없다.
