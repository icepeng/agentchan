# Renderer presentation machine은 pure reducer로 구현한다

Renderer lifecycle은 React hook 내부 effect/ref 묶음이 아니라 framework-agnostic pure reducer `transition(state, event) => { state, commands }`와 `initialState()`로 구현한다.
React adapter는 reducer state를 보관하고 commands를 실행하며, import 결과와 timer fire 같은 비동기 결과는 generation으로 stale event를 drop해 race와 phase 전이를 React 없이 단위 테스트할 수 있게 한다.
