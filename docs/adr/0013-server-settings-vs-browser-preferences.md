# Creative agent가 읽는 값은 서버에 둔다

Agentchan에는 설정처럼 보이는 값이 두 종류 섞여 있다. 하나는 LLM 호출이나 Creative agent 실행에 실제로 쓰이는 값이다 — Active provider, Active model, API key, OAuth connection, Custom provider 정의, Template trust처럼 install 전체에 적용되거나 server runtime이 읽는 값이다. 다른 하나는 현재 브라우저에서만 의미 있는 표시 상태다 — panel 크기, device preference, dismissal signal처럼 Creative agent가 읽지 않고 다른 브라우저나 실행 환경으로 옮겨도 본질이 바뀌지 않는 값이다.

이 경계를 "UI에서 바꾸는가"로 나누면 금방 무너진다. API key나 Active provider도 UI에서 바꾸지만 Creative agent가 호출 시 읽는 값이고, dismissal 상태도 Settings 화면에 보일 수 있지만 현재 브라우저의 표시 선호일 뿐이다. 반대로 편의를 위해 같은 값을 server와 localStorage에 동시에 저장하면 stale value와 migration 경로가 둘로 늘어난다.

경계는 *Creative agent가 읽는가*와 *device 단위 값인가*로 잡는다. Creative agent가 읽거나 install 전체에 적용되는 값은 서버에 둔다. 특정 브라우저의 UI state, device preference, dismissal signal은 브라우저에 둔다. 한 값은 한 곳에만 영속한다 — 경계가 애매하면 Creative agent가 읽는지 묻고, 읽으면 서버 저장 값이 source of truth다.

## Consequences

- 모든 브라우저 저장 preference key는 단일 등록 지점을 거친다.
- 서버 저장소와 브라우저 저장소 사이로 값을 옮길 때는 이전 source를 제거하거나 migration한다. 같은 값을 mirror/cache로 양쪽에 남기지 않는다.
