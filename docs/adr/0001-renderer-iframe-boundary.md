# Renderer iframe boundary

Renderer는 `sandbox="allow-scripts"`가 적용된 null-origin iframe document에서 실행하고, Host와는 INIT으로 전달된 `MessagePort`의 fire-and-forget RPC만 사용한다. **Trusted template**은 **Project** 시작점으로 삼아도 된다는 신뢰이지, **Author**가 작성한 Renderer를 runtime에 Host와 같은 권한으로 실행해도 된다는 뜻이 아니다.

INIT은 iframe HTML을 Host가 생성하고 payload에 비밀 값이 없다는 전제에서만 `'*'` targetOrigin으로 보낸다. RPC interface는 **User** 의도의 표현만 전달하며 Host 동작을 직접 실행하는 capability를 열지 않는다. Renderer가 직접 가져오는 자원은 Host origin을 포함한 절대 URL이어야 하고, 범위는 read-only **Project content**와 Renderer 실행 자원으로 제한한다. Iframe 크기는 Host가 정한 fixed container가 소유하고, Renderer는 그 안의 scroll만 소유한다.

## Considered Options

- **Same-origin, no sandbox**: **Trusted template**만으로 runtime 권한을 공유하면, community **Template**을 받거나 **User**가 runtime에 Renderer를 고치는 순간 격리를 뒤늦게 끼워 넣어야 한다.
- **Cross-origin via subdomain or separate port**: 격리 강도는 충분하지만 portless, dev server, **Desktop app** packaging 부담이 커진다. Null-origin sandbox가 인프라 변경 없이 같은 수준의 격리를 준다.
- **Iframe content-driven auto-grow**: Renderer 내용이 Host layout을 밀면 scroll 위치와 **Project** 채팅 UI 레이아웃이 흔들린다.
- **Shadow DOM 격리**: CSS만 분리되고 globals, storage, JavaScript 실행 권한은 같은 document에 남는다.

## Consequences

- Renderer가 받는 자원은 null-origin에서 출발하는 cross-origin 요청이므로 Host가 모든 응답에 CORS header를 붙여야 한다.
- Renderer의 `100vh`와 `100dvh`는 iframe document 기준이다.
- 외부 링크 native open, file write, top-level navigation은 새 RPC capability가 추가되기 전까지 동작하지 않는다.
