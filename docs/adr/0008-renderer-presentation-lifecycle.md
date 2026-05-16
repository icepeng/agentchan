# Renderer presentation lifecycle

Renderer 교체는 fade-out → Project theme 적용 → fade-in의 순차 presentation으로 처리한다. 병렬 cross-fade로 묶으면 Project 채팅 UI 색 전환과 Renderer 안쪽 전환의 타이밍이 어긋나 보인다.

새 Renderer는 별도 iframe slot에서 백그라운드로 bundle import와 INIT을 진행한다. Iframe element는 `(slug, digest)` tuple로 식별되고, 같은 iframe document에 다른 bundle을 import하지 않는다.

1. 이전 Renderer는 기존 Project theme 아래에서 fade-out한다.
2. 새 slot의 MOUNTED ack과 이전 fade-out이 모두 끝나면, Host가 새 Renderer를 visually hidden 상태로 둔 채 다음 Project theme을 적용하고 Project 채팅 UI color transition을 기다린다.
3. Project theme 전환이 끝나면 새 Renderer를 fade-in한다.

## Considered Options

- **Single-iframe `src` change**: 한 element에 두 navigation을 동시에 가질 수 없어 phase 분리가 불가능하고, bundle import도 직렬화되어 swap 동안 빈 구간이 생긴다.
- **Same-iframe dynamic re-import**: iframe document module cache 충돌, 이전 Renderer가 mutate한 DOM/CSS 잔류, listener/instance 누수.

## Consequences

- Project theme 전환 시간만큼 전체 Project 전환이 길어지지만, Renderer fade-in과 Project 채팅 UI color transition이 겹치지 않는다.
- 두 slot이 짧게 동시에 떠 있어 메모리 사용이 일시적으로 두 배가 된다.
- Stale generation의 ack(MOUNTED, FADE_DONE 등)이 도착할 수 있으므로 모든 ack은 generation 번호로 가드되어야 한다.
