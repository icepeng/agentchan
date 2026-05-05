# Web UI view state

Web UI에서 현재 보이는 화면은 `View` discriminated union으로 보관한다. `View`는 `templates`, `settings`, `project` 중 하나이고, `project`일 때만 `slug`, `session`, `mode: "chat" | "edit"`를 함께 가진다. Active Project와 active Session은 별도 selection context가 아니라 `View`에서 derive한다.

Navigation transition은 `viewReducer`의 단일 action으로 처리한다. `OPEN_PROJECT(slug)`는 Project view로 전환하고, 해당 Project의 마지막 Session을 `sessionMemory`에서 복원하며, mode는 항상 `chat`으로 시작한다. `OPEN_SESSION(sessionId)`는 현재 Project view의 Session을 바꾸고 `sessionMemory`를 갱신한다. `SET_VIEW_MODE`는 Project view 안에서만 `chat`/`edit`을 바꾼다.

`sessionMemory`는 Project별 마지막 Session만 기억한다. Mode memory는 두지 않는다. Project를 다시 열거나 templates/settings를 다녀온 뒤 Project에 들어오면 `chat` mode로 시작한다.

Motivation: 이전 구조는 page, active Project, active Session, chat/edit mode가 서로 다른 context에 흩어져 있었다. Project 탭을 눌렀는데 page는 templates에 남는 식의 회귀가 생겼고, caller가 여러 dispatch를 올바른 순서로 묶어야 했다.

## Considered Options

- **분산 context를 유지하고 helper hook으로 dispatch를 묶기**: 기각. Caller가 helper 사용을 잊으면 같은 회귀가 다시 생긴다.
- **URL/router를 view state의 단일 출처로 사용**: 기각. Agentchan은 Project 단위 데스크톱 스타일 앱이고, 현재 필요한 것은 deep link보다 화면 결정 state의 일원화다.
- **Mode memory 저장**: 기각. `chat`/`edit`은 Project 안에서 잠시 바꾸는 작업 의도이고, Project 진입 시에는 `chat`으로 시작하는 편이 예측 가능하다.

## Consequences

- `ProjectSelectionContext`는 둔다면 중복 state가 되므로 제거한다.
- `SessionSelectionContext`에는 Session 내부 anchor인 `replyToEntryId`만 남긴다. 열린 Session id는 `View`의 `project.session`이다.
- `projects`, `sessions`, `agentState`, `renderer`는 view state가 아니라 fetch된 데이터로 남긴다.
- URL을 단일 출처로 쓰지 않으므로 새로고침/dev reload 시 view 전체를 복원하지 않는다. Bootstrap에는 `localStore.lastProject`만 사용한다.
