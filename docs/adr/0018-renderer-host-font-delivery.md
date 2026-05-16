# Cross-project shared asset path

ADR-0001은 Renderer를 별도 iframe document로 격리했고, ADR-0014는 Host fallback token에 `--agentchan-default-font-*`를 포함시켰다. Iframe document는 부모의 font 등록을 상속하지 않으므로, Host가 token에 font-family 이름만 적고 binary 전달을 하지 않으면 iframe Renderer는 system-ui로 폴백한다.

## Decision

Agentchan install 단위로 cross-project shared asset path를 둔다. 첫 사용처는 `/fonts/*`이고, Host는 이 경로에서 font binary와 `@font-face` 선언을 CORS-enabled로 serve한다. Iframe Renderer와 부모 UI는 같은 `/fonts/index.css` stylesheet를 link한다.

`apps/webui/public/fonts/` 아래에 font별 폴더를 두고, 각 폴더는 `index.css`와 single variable woff2 파일을 가진다. 루트 `fonts/index.css`는 각 폴더의 stylesheet를 `@import`하는 aggregator다. 새 기본 font를 추가할 때는 폴더 하나와 aggregator 한 줄을 추가한다.

현재 prefilled item은 `Pretendard Variable`, `Lexend`, `Syne`, `Fira Code`다. 이 목록은 Host-only special case가 아니라 agentchan install에 미리 채워진 shared font set이다. ADR-0014의 `--agentchan-default-font-display`, `--agentchan-default-font-body`, `--agentchan-default-font-mono` token 표면은 그대로 유지한다.

Font binary는 npm dep + build-time copy가 아니라 repo에 직접 commit한다. 첫 release에서는 shared path mechanism 자체를 단순하게 고정하는 편이 더 중요하다. 향후 font fetch, user cache fill, `/libs/*` 같은 library import cache가 필요해지면 같은 cross-project shared asset path mechanism으로 확장할 수 있다.

## Consequences

Renderer iframe과 부모 UI가 같은 font delivery path를 사용하므로 null-origin sandbox에서도 font-family token이 실제 font binary와 연결된다. Desktop app을 오프라인에서 실행해도 Google Fonts나 jsdelivr에 의존하지 않는다.

Project를 새로 만들 때마다 기본 font binary를 workspace에 복사하지 않는다. 기본 font는 install 단위 shared asset이고, Template 전용 추가 font만 workspace `files/`에 둔다.

Author가 추가 font를 ship할 때는 `files/fonts/...`에 binary를 넣고 Renderer에서 `fileUrl(snapshot, "fonts/...")`로 host-absolute URL을 만든 뒤 React 19 declarative `<style>` 또는 `<link rel="stylesheet">` hoisting으로 iframe document에 등록한다. `--agentchan-default-font-*` token은 기본 제공 font set을 가리키는 안정 계약으로 남는다.

## Considered Options

- **iframe shell에 Google Fonts / jsdelivr `<link>` 재삽입**: Desktop app 오프라인에서 system-ui로 폴백한다. Browser storage partitioning 때문에 null-origin iframe이 부모 document cache와 분리되어 같은 woff2를 다시 요청할 수 있다.
- **`--agentchan-default-font-*`를 system-ui로 격하**: ADR-0014의 token 목록이 의미를 잃고 한국어 visual identity가 OS font에 의존한다.
- **Token은 유지하되 font 파일은 Author renderer.css가 직접 가져옴**: Token이 약속하는 font-family와 실제 가용성이 어긋난다. Author마다 같은 boilerplate와 중복 binary를 ship하게 된다.
- **Pretendard dynamic-subset 그대로 self-host**: 약 120개 woff2 파일을 ship해야 해서 repo와 서빙 구조가 복잡해진다. Desktop-first 환경에서는 첫 로드 뒤 cache hit가 많아 single variable woff2의 단순성이 더 낫다.
- **iframe shell HTML을 Author에게 노출**: VS Code webview나 Figma plugin처럼 Author가 importmap, bootstrap, host theme link를 직접 ship할 수 있다. 하지만 Host React version, importmap, lifecycle bootstrap이 모든 외부 Template과 결합되고 default behavior와 Host UI 일관성이 약해진다. Null-origin sandbox가 이미 보안 boundary를 잡고 있으므로 비용의 핵심은 보안이 아니라 lifecycle, default behavior, Host 진화 자유도다.
