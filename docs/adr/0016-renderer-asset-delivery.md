# Renderer asset delivery

Iframe document 자체는 host server가 serve하는 project-independent static shell이다.

Per-project Renderer bundle과 CSS는 그 shell 안에서 dynamic import되는 HTTP asset이며, 각 asset은 digest로 식별된다.

같은 digest는 immutable cache 대상이 될 수 있고, 바뀐 digest는 새 URL로 import된다.

Motivation: Renderer code는 Author가 디버깅해야 하는 외부 작성 코드다. Bundle delivery는 sandbox/cross-origin 전환에 열려있어야 하며, 브라우저 디버깅 도구에 친화적이어야 한다.

## Considered Options

- **Blob URL import**: 기각. 초기 wiring은 작지만 sandbox/cross-origin 전환과 디버깅에 취약하다.
- **Bundle source를 JSON으로 내려주기**: 기각. HTTP asset이 아니라 data payload가 되어 cache, source map, stack trace 기준이 흐려진다.
- **Iframe shell에 bundle source inline**: 기각. project-independent shell cache와 per-project Renderer cache가 결합된다.
