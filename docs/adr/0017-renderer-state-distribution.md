# Renderer state distribution

`applyAgentEvent`가 Renderer가 보는 Session state를 만드는 canonical reducer다.

Host와 iframe은 동일한 `applyAgentEvent`를 각자 import해서 들어오는 AgentEvent를 fold한다. Wire는 event를 나르고, 매 frame 직렬화된 state snapshot을 나르지 않는다.

Reducer는 deterministic해야 한다. 양쪽이 같은 event sequence로 같은 state를 만들 수 있어야 drift가 없다.

## Considered Options

- **Host pre-fold + push reduced state per frame**: 단순하지만 매 event마다 full snapshot serialize 비용이 발생한다.

## Consequences

- `applyAgentEvent`와 `AgentState`는 host와 iframe adapter가 함께 import할 수 있는 browser-safe 엔트리가 소유한다.