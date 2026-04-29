# Agentchan

Agentchan은 사용자가 만든 프로젝트(작품)를 위해 LLM agent를 호스팅하고, 프로젝트별 renderer를 화면에 띄우는 데스크톱-스타일 web app이다. 이 문서는 프로젝트 어휘 중 코드만으로는 흐릿한 개념을 박아둔다.

## Language

### Renderer 영역

**Renderer**:
프로젝트별 시각 표면을 구성하는 사용자 작성 코드. `renderer/index.ts(x)`에서 named export `renderer`를 제공한다.
_Avoid_: view, template, theme

**Renderer surface**:
Renderer 작성자가 의존할 수 있는 안정 작성 계약(`@agentchan/renderer/core`, `@agentchan/renderer/react`의 공개 API). ADR-0001에서 정의한다.
_Avoid_: API, contract — "renderer surface"로 지칭

**Renderer bundle**:
Renderer source를 host가 import 가능한 형태로 빌드한 결과물(`{ js, css }`).
_Avoid_: build, output

**Renderer snapshot**:
`{ slug, baseUrl, files, state }` — host가 renderer에 전달하는 데이터.
_Avoid_: data, props, view-model

**Renderer presentation machine**:
Renderer가 화면에 들어오고 사라지는 *전이 규칙*을 가진 host 측 deep module. 외부 이벤트(slug 변화, bundle/snapshot 도착, error)를 받아 `{ phase, theme, error, layerClassName }` snapshot을 노출한다. 의존성(layer 핸들, module importer, clock)은 DI로 받는다.
_Avoid_: renderer host, host machine, host state machine — "presentation machine"으로 지칭

**Renderer layer**:
Renderer module을 실제로 mount하는 ShadowRoot DOM adapter. Presentation machine은 layer 핸들을 통해 mount/clear/updateSnapshot을 일으킨다.
_Avoid_: container, root

## Relationships

- **Renderer presentation machine**은 `slug`, `bundle`, `snapshot`, `error` 변화를 외부 이벤트로 받아 라이프사이클을 진행하고, **renderer layer**에 mount/clear 명령을 일으킨다.
- **Renderer surface**(작성자 측 계약)는 ADR-0001 범위이며 host의 **renderer presentation machine** 구현과 독립적이다 — runtime backend는 ADR-0001 외부 사항으로 자유롭게 바꿀 수 있다.
- **Renderer bundle**과 **renderer snapshot**은 server에서 fetch한 _데이터_고, **renderer presentation machine**의 _상태_와 다른 카테고리다. 두 가지를 같은 store에 합치지 않는다.

## Example dialogue

> **Dev:** "프로젝트를 전환했는데 이전 프로젝트의 화면이 잠깐 보였어요. 어디를 고치죠?"
> **Maintainer:** "그건 **renderer presentation machine**의 책임이에요. 전이는 거기서 닫혀야 해요. 외부에서 entity reducer를 직접 비우는 게 아니라 `slug-changed` 이벤트를 보내면 됩니다."

> **Dev:** "**Renderer surface**가 바뀐 건가요?"
> **Maintainer:** "아뇨, **renderer surface**는 ADR-0001이 정한 작성자 계약이에요. 화면 전이는 host implementation detail이라 **renderer presentation machine** 한 곳에서만 바뀝니다."
