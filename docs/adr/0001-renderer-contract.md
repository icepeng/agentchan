# Renderer 작성 계약

Renderer entrypoint는 `renderer/index.ts` 또는 `renderer/index.tsx`이며, named export `renderer`를 제공한다. Host Web UI가 의존하는 것은 `mount(container, bridge)`, `update(snapshot)`, `unmount()`, optional `theme(snapshot)`을 가진 renderer runtime 계약이다.

Renderer 작성자가 의존할 수 있는 공개 API는 `@agentchan/renderer/core`, `@agentchan/renderer/react` 패키지로 제공한다.
이 외에 허용되는 import는 `renderer/` 내부 relative import, CSS import다.
Build policy는 허용된 bare import와 `renderer/` 경계를 검사한다(`packages/renderer/src/build/policy.ts`).
Renderer API의 agent state message 표면은 pi-ai의 `Message` contract를 그대로 노출한다.

`RendererAgentState.messages`는 `readonly Message[]`, `streamingMessage`는 `AssistantMessage`다.
`@agentchan/renderer/core`와 `@agentchan/renderer/react`는 `Message`, `UserMessage`, `AssistantMessage`, `ToolResultMessage`, `TextContent`, `ThinkingContent`, `ImageContent`, `ToolCall`, `AssistantContentBlock`을 type-only로 재노출한다.
Agentchan 내부 LLM context bookkeeping인 `CompactionSummaryMessage`는 renderer contract에서 제외한다. Host boundary는 renderer snapshot을 만들기 전에 이 variant를 필터링한다.

Motivation: 첫 Renderer 초안은 `renderer/index.tsx`의 React component default export를 host Web UI의 React tree 안에 직접 render했다. 단순한 React view에는 작동했지만, r3f와 같은 라이브러리 사용시 React 트리 공유로 인한 문제를 해결하는 것이 불가능했다. 당장 r3f를 사용하는 Renderer가 없더라도, 작성 계약을 나중에 바꾸기 어려우므로 가능한 안전하게 설계한다.

## Considered Options

- **React component default export를 host tree에 직접 render**: 기각. 가장 단순하지만 Author 코드가 host React runtime identity와 reconciler에 묶인다.
- **V1부터 iframe, Project별 `package.json`, dependency install을 작성 계약에 포함**: 보류. 격리는 강하지만 Author에게 package manager 계약을 요구하고, User에게 Project 실행 시 install 상태와 실패를 노출한다.
- **`agentchan:renderer/v1` 같은 virtual module specifier**: 기각. Author가 의존하는 import specifier는 실제 package 형태여야 package 추출과 lockfile 관리가 자연스럽다.

## Consequences

- Renderer module은 `export const renderer = ...` 형태로 작성한다.
- Host는 Renderer를 React component로 다루지 않고 독립된 runtime으로 다룬다.
- React adapter는 renderer component를 runtime contract로 감싸며, host가 직접 render할 component를 export하지 않는다.
- Runtime backend가 ShadowRoot, iframe, 다른 bridge로 바뀌어도 Author가 의존하는 entrypoint와 adapter API는 유지되어야 한다.
- Renderer는 host가 제공한 `RendererSnapshot`을 읽고 `RendererActions`로 요청한다. Session, storage, routing 소유권은 host에 남는다.
- Project content asset URL은 host DOM이나 server path를 추측하지 않고 `fileUrl(snapshot, fileOrPath)`로 만든다.

## Reconsider When

- 위 작성 계약을 지킨 renderer가 backend 변경 시 source 변경 없이 실행되지 않을 때.
- 추가 npm package(예: `@react-three/fiber`, `three`)가 primary renderer use case가 되어 stable dependency resolver나 Project별 dependency isolation이 필요해질 때.
- pi-ai `Message` shape가 renderer 작성자가 직접 감당하기 어려울 정도로 의미상 변경될 때.
- compaction 또는 다른 agentchan-internal event를 사용자-facing renderer에서 시각화해야 하는 명확한 use case가 생길 때.
