# Renderer presentation lifecycle

Renderer 교체는 two-slot cross-fade로 동작한다. 새 slot이 백그라운드에서 bundle import와 INIT을 진행하는 동안 이전 slot은 계속 보이며 fade-out하고, MOUNTED ack과 fade-out 완료가 모두 충족되면 swap이 일어난다.

Iframe element identity는 `(slug, digest)` tuple에 묶이고, 어느 한쪽 변경은 iframe element 재생성을 의미한다. 같은 iframe document에 다른 bundle을 import하지 않는다.

## Considered Options

- **Single-iframe `src` change**: 한 element에 두 navigation을 동시에 가질 수 없으므로 cross-fade 불가능. Bundle import가 직렬화되고 swap 동안 시각적 deadzone이 생긴다.
- **Same-iframe dynamic re-import**: iframe document module cache 충돌, 이전 Renderer가 mutate한 DOM/CSS 잔류, listener/instance 누수.

## Consequences

- 두 slot이 짧은 시간 동안 동시에 alive하므로 메모리 사용이 일시적으로 두 배.
- Stale generation의 ack(MOUNTED, FADE_DONE 등)이 도착할 수 있으므로 모든 ack은 generation 번호로 가드되어야 한다.
