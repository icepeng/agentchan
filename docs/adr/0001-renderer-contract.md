# Renderer 작성 계약

Renderer entrypoint는 `renderer/index.ts` 또는 `renderer/index.tsx`이며, named export `renderer`를 제공한다. Author가 의존하는 runtime 계약은 `mount(container, bridge)`, `update(snapshot)`, `unmount()`, optional `theme(snapshot)`이다.

공개 API는 `@agentchan/renderer/core`, `@agentchan/renderer/react` 패키지로 제공한다. 이 외에 허용되는 import는 `renderer/` 내부 relative import, CSS import다. Build policy가 bare import와 `renderer/` 경계를 검사한다.

Renderer는 host와 별개 realm(iframe)에서 실행한다. Host는 Project별 `/api/projects/{slug}/__renderer/index.html`을 서브하고 `<iframe>`이 그 URL을 src로 로드한다. iframe은 same-origin sub-path이며, sandbox는 navigation/top window는 막되 same-origin은 유지한다. Host와 iframe은 postMessage로만 통신한다.

Host → iframe 메시지: `init { protocol, snapshot }`, `agent_event { event }`, `file_change { added | modified | removed }`, `dispose`. Iframe → host 메시지: `ready`, `theme { theme }`, `disposed`, `error { message, stack? }`, `action_invoke { name, args }`. Author가 보는 표면은 여전히 `RendererSnapshot`과 `RendererActions`다 — `@agentchan/renderer/core`가 `agent_event` 흐름을 reduce해 snapshot을 만들고 author의 `update(snapshot)`을 호출한다. AgentEvent vocabulary는 transport 내부에만 있고 author에게 노출하지 않는다.

`theme(snapshot)`은 iframe 안에서만 실행한다. Iframe이 ready 후 첫 `theme` event를 push하고 snapshot 변화 시 재푸시한다. Host의 presentation은 fade-out → mount → `theme` 도착 또는 cap timeout → fade-in 순으로 event-aware하게 진행한다. Cap에 걸리면 default chrome으로 fade-in을 진행하고, 늦게 도착한 theme은 도착 후 transition으로 적용한다.

Dispose는 ack 계약이다. Host가 `dispose`를 보내면 iframe은 `instance.unmount()`를 실행하고 `disposed`를 post한 뒤 host가 iframe을 제거한다. r3f/canvas의 GL context release 같은 cleanup은 이 단계에 들어간다. mount/update에서 throw된 error는 iframe runtime이 catch해 `error` event로 보내고 host가 error chrome을 노출한다.

Renderer API의 agent state message 표면은 pi-ai의 `Message` contract를 그대로 노출한다. `RendererAgentState.messages`는 `readonly Message[]`, `streamingMessage`는 `AssistantMessage`다. `@agentchan/renderer/core`와 `@agentchan/renderer/react`는 `Message`, `UserMessage`, `AssistantMessage`, `ToolResultMessage`, `TextContent`, `ThinkingContent`, `ImageContent`, `ToolCall`, `AssistantContentBlock`을 type-only로 재노출한다. Agentchan 내부 LLM context bookkeeping인 `CompactionSummaryMessage`는 renderer contract에서 제외한다. Host boundary는 snapshot을 만들기 전에 이 variant를 필터링한다.

Project content asset URL은 host DOM이나 server path를 추측하지 않고 `fileUrl(snapshot, fileOrPath)`로 만든다. iframe도 same-origin이므로 같은 URL을 직접 fetch한다.

Actions 표면은 `send`, `fill` 둘이다. 추가 action은 별도 ADR로 도입한다. 메시지는 method-name 디스패치라 새 action 추가가 forward-compatible이다.

Motivation: 첫 초안은 `renderer/index.tsx`의 React component default export를 host React tree에 직접 render했다. r3f처럼 host와 React identity가 충돌하는 라이브러리에 닫혀 있었고, ShadowRoot로 옮긴 변형도 같은 React universe라 같은 한계를 가졌다. iframe + postMessage는 author가 자기 React/dependency universe를 자유롭게 들고 올 수 있게 한다.

## Considered Options

- **React component default export를 host tree에 직접 render**: 기각. Author 코드가 host React runtime identity와 reconciler에 묶인다.
- **ShadowRoot + direct DOM call**: 기각. CSS는 격리되지만 React/JS realm은 host와 같아 r3f 같은 use case가 막힌다.
- **`agentchan:renderer/v1` 같은 virtual module specifier**: 기각. Author가 의존하는 import specifier는 실제 package 형태여야 package 추출과 lockfile 관리가 자연스럽다.
- **Snapshot 전체를 매 update마다 postMessage**: 기각. Streaming 토큰마다 전체 messages/files를 structuredClone하면 비용이 통제 불능이다.
- **Author API를 event-only로 노출**: 기각. 일반 author는 reducer를 다시 쓰지 않아도 snapshot view로 충분하다. event vocabulary는 transport 내부에만 둔다.
- **Theme을 build 시점에 server-side로 precompute**: 기각. Theme 함수의 dual-env 제약과 mini-bundle 추출 비용을 쓰지 않고도 fade window + event-aware presentation으로 boot flash를 가린다.

## Consequences

- Bundle은 iframe 안에서 자족적으로 실행되며 React/react-dom을 자기 안에 인라인한다. r3f identity 문제는 자동 해소된다.
- Host의 presentation 상태기는 timer-only가 아니라 `theme` event 도착 또는 timeout cap에 의해 진행된다.
- `RendererLayer`의 2-layer crossfade 모델은 두 iframe element 동시 alive로 매핑된다.
- Trust gate는 Trusted template에 남는다. iframe sandbox는 navigation 차단 정도의 안전벨트이며 trust 자체를 대체하지 않는다.

## Reconsider When

- 추가 npm package(예: `@react-three/fiber`, `three`)가 primary renderer use case가 되어 Project별 dependency isolation, lockfile, package shape를 작성 계약에 끌어와야 할 때.
- iframe boot latency가 fade window를 일관되게 벗어나는 device class가 user-facing이 될 때.
- pi-ai `Message` shape가 renderer 작성자가 직접 감당하기 어려울 정도로 의미상 변경될 때.
- compaction 또는 다른 agentchan-internal event를 사용자-facing renderer에서 시각화해야 하는 명확한 use case가 생길 때.
