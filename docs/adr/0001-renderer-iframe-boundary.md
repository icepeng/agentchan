# Renderer iframe boundary

Host는 Renderer를 host React tree 안에서 실행하지 않는다. Renderer는 iframe document 안에서 실행한다.

Host와 iframe은 transferred `MessagePort` 위 RPC로만 통신한다. 공유 객체, globals, storage는 통신 경로로 쓰지 않는다. RPC가 단일 채널이라 boundary를 넘는 트래픽이 명시적이고, 미래의 sandbox/cross-origin 전환에 깨지지 않는다.

Host가 Renderer에 전달하는 Project resource URL은 host origin을 포함한 절대 URL이다. 이 URL은 iframe origin이 바뀌어도 깨지지 않아야 한다.

Scroll은 Renderer가 소유한다. Host는 iframe 높이를 콘텐츠에 맞춰 늘리지 않는다. Iframe content auto-grow는 매 layout 변화마다 cross-frame RPC와 parent reflow를 일으키고, Project 채팅 영역이 콘텐츠 길이에 따라 흔들린다.

Motivation: Renderer code는 Template과 Project마다 갈라진다. host DOM, host React tree, host storage에 직접 붙이면 Renderer code와 Web UI 구현이 결합된다. 이 결합은 향후 sandbox/cross-origin 격리로 옮길 때 boundary를 다시 설계하게 만든다.

## Considered Options

- **Shadow DOM 격리**: 이미 갔던 길. CSS는 분리되지만 globals/storage/JS는 같은 document에 공유되어 boundary가 약하다.

## Consequences

- Renderer의 `100vh`/`100dvh`는 iframe document 기준이다.
