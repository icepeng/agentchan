# ADR 0008: Renderer presentation machine은 pure reducer로 구현한다

Status: Accepted
Date: 2026-04-29

## Context

Web UI의 renderer host 라이프사이클(slug 변경 → fade-out → bundle import →
theme transition → mount → fade-in)은 현재 React hook
(`useRendererHostMachine`)에 6개 useEffect와 7개 useRef로 펼쳐져 있다. race
(stale slug, generation 어긋남)와 timer corner case를 단위 테스트할 공개 면이
없고, host 측 상태(phase·visibleError)가 entity reducer
(`RendererViewContext`)와 외부 caller(`useProject`의 `CLEAR_RENDERER` dispatch)에
누출되어 있다.

깊은 host module이 필요하다는 결론에는 도달했지만 그 module의 형태에는
여러 갈래가 있다: framework-agnostic vs React-bound, instance vs pure reducer,
callback vs state snapshot, side effect를 내부 호출로 일으키기 vs commands로
반환하기, race를 generation drop vs AbortController.

## Decision

Renderer presentation machine은 framework-agnostic pure reducer로 구현한다.

- Public surface는 `transition(state, event) => { state, commands }`와
  `initialState()` 둘이다. instance, observe, callback API는 두지 않는다.
- React adapter는 `useReducer`로 state를 보관하고 commands를 실행한다.
  비동기 결과(import 성공/실패, timer fire)는 dispatched event로 reducer에
  되돌아온다.
- Generation은 reducer가 state 안에서 단조 증가시킨다. stale event는
  identity-equal state로 무시한다. in-flight import를 AbortController로
  취소하지 않는다 — 결과를 drop한다.
- Side effect(layer mount/clear, module import, timer schedule)는 commands로
  노출하고 adapter가 실행한다. effect runner를 module에 주입하지 않는다.
- phase·visibleError는 module state 내부에 둔다. entity reducer
  (`RendererViewContext`)는 server data(bundle/snapshot/error)와 emitted
  theme만 보관한다. `CLEAR_RENDERER` action은 삭제한다.
- Theme 평가는 import command의 결과 이벤트(`IMPORT_OK`)에 실어 보낸다.
  module이 user code(`renderer.theme`)를 직접 호출하지 않는다.

## Consequences

- race·timer·phase 전이가 React 없이 동기 transition 시퀀스로 단위
  테스트된다.
- `useRendererHostMachine`의 6 useEffect / 7 useRef는 얇은 React adapter
  (~70줄)로 줄어든다.
- entity reducer가 다중-caller 게시판에서 server data store로 단순화되고,
  `useProject`의 라이프사이클 dispatch 3건이 사라진다.
- timer duration은 reducer에 closure로 주입(설정 가능). 단위 테스트는 0ms로
  즉시 advance.
- in-flight import 결과 drop이 wasted work를 만든다 — generation 기반
  무시가 AbortController 인프라 비용보다 단순하다고 판단.

## Reconsider When

- 라이프사이클 phase가 늘어나 `transition`의 case 분기가 가독성 한계를
  넘는다 — actor framework(xstate 등) 도입 검토.
- in-flight import 결과 drop이 네트워크·CPU 체감 비용이 된다 —
  AbortController 도입 검토.
- iframe runtime backend(ADR-0001 reconsider 조건)로 전환되어 host ↔
  renderer 통신이 message passing이 되면 이 reducer 모델을 message
  handler로 옮길지 재검토.
