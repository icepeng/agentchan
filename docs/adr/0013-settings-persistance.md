# Settings 저장 위치

Creative agent 실행이나 agentchan 설치 전체에 영향을 주는 값은 서버의 `settings.db`에 저장한다. Active provider, Active model, API key, OAuth connection, Custom provider 정의, Template trust, Context window, max tokens, temperature, thinking level이 여기에 속한다.

현재 브라우저에서만 의미 있는 표시 선호는 `localStorage`에 저장한다. Theme preference, language preference, notification preference, update dismissal, last Project bootstrap 값이 여기에 속한다. Client code는 `localStorage`를 직접 호출하지 않고 `localStore` registry를 거친다.

한 값은 한 곳에만 영속한다. 경계가 애매하면 Creative agent가 읽는지, 또는 다른 브라우저에서도 같은 값이어야 하는지 묻는다. 둘 중 하나라도 맞으면 `settings.db`가 source of truth다.

## Consequences

- 새 browser-persistent key는 `localStore`에 등록한다.
- 서버 저장소와 브라우저 저장소 사이로 값을 옮길 때는 이전 source를 제거하거나 migration한다.