# Renderer author SDK

Author가 작성하는 Renderer는 React component 하나다. SDK는 component의 props와 옵션만 정의하고, mount/update/unmount lifecycle은 내부에서 처리한다. 진입점은 `renderer/index.tsx` 하나로 고정하고, author는 `@agentchan/renderer/react`에서 `createRenderer`를 가져와 `renderer = createRenderer(Component, options?)`를 named export로 내보낸다.

Component는 `{ snapshot, actions }` props를 받는다. `snapshot.state`는 host와 같은 canonical `AgentState`이고, Project file URL은 `fileUrl(snapshot, file)`로 만든다. Renderer가 자기 Project theme을 직접 정의할 때만 `options.theme`을 추가한다.

Motivation: Renderer는 Template author가 작성하는 외부 코드다. 내부가 바뀔 때 그 외부 코드가 함께 흔들리지 않게, SDK가 변화를 안쪽에서 흡수해야 한다.

## Considered Options

- **Renderer 전용 state interface 분리**: 기각. canonical Session 상태와 Renderer 상태가 따로 가면 두 schema 사이 호환을 Template마다 직접 챙겨야 한다.
- **다중 framework 진입점 (`createSolid` / `createSvelte` 등) 동시 구현**: 기각. 지금 React 외에 부르는 곳이 없고, baseline vendor sharing도 framework 하나를 전제한다. 표면 모양은 가능성을 열어두되 구현은 실제 caller가 생긴 뒤로 미룬다.
