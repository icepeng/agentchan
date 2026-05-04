# Web UI navigation은 분산 selection이 아니라 단일 View discriminated union이 결정한다

Web UI는 어느 화면이 보이는지를 네 군데에 흩어 보관해 왔다 — page 전환(main / templates / settings), active project, Project별 마지막 Session, chat/edit 토글이 각각 다른 context였다. 그 결과 cross-domain 전환은 caller가 두 개 이상의 dispatch를 *직접 묶어* 호출해야 했고, 한 쪽을 잊으면 화면이 어긋났다 — templates 페이지에 머물면서 사이드바의 Project 탭을 눌러도 active project만 바뀌고 페이지는 templates에 남는 회귀가 그 예다.

이 클래스의 회귀를 router(react-router · @tanstack/router)와 URL을 SSoT로 올리는 모델로 풀 수 있는지 검토했다. 결론은 *채택하지 않는다*. agentchan은 Project 단위 데스크톱-스타일 창작 놀이 앱이고 Tauri / electrobun으로 webview wrapping될 가능성이 있다 — 브라우저 뒤로가기 / 딥링크 / 공유 같은 URL 진영의 효용이 이 형태에서 약하다. 진짜 결함은 *URL 부재*가 아니라 *view-determining state가 한 곳에 모이지 않은 것*이다. URL을 도입해도 selection을 URL 밖에 두면 같은 회귀가 다시 난다.

해결은 view-determining state를 *한 reducer 안의 하나의 discriminated union*으로 모으는 것이다. View는 kind에 따라 templates / settings / project로 분기하고, project kind일 때만 slug · session · mode 필드를 같이 들고 다닌다. 모든 navigation transition은 *한 번의 dispatch*로 끝난다 — Project 열기는 kind, slug, sessionMemory에서 lookup한 마지막 Session, 항상 chat으로 시작하는 mode를 동시에 결정한다. viewMode 필드는 project kind 안으로 흡수된다 — templates/settings에서는 type level에 mode가 없어, AppShell의 다중 조건 결합 검사가 `view.kind === "project"` narrow 한 줄로 무너진다.

Session memory는 보관한다 — *Project 안에서의 위치*는 작업의 연속성이고, Project를 다시 열 때 마지막 Session이 복원되어야 한다. 반면 mode memory(global lastMode 또는 per-project)는 *두지 않는다* — chat/edit 토글은 작업 의도이고, view를 떠나면 같이 끝나는 게 자연스럽다. 두 메모리의 비대칭이 의미 차이를 명시한다.

URL을 SSoT로 올리지 않으므로 새로고침 / dev reload 시 view 복원도 하지 않는다(`localStore.lastProject` 한 줄만 부트스트랩에 남는다). 이는 *새로고침 시 holding screen* 약점을 그대로 들여오는 trade-off다 — 데스크톱-스타일 사용 패턴에서는 새로고침 자체가 드물다는 가정 위에 선다.

## Considered Options

- **현재 분산 context를 유지하고 cross-domain 전환마다 helper hook으로 dispatch 묶기** — 기각. 새 helper마다 caller가 그걸 *기억해서 써야* 한다 — 한 caller가 잊으면 같은 회귀가 난다. 구조 결함이 helper 수만큼 표면으로 남는다.

## Consequences

- `useProject.selectProject`의 4-domain orchestration이 reducer 안으로 흡수되며, features layer hook은 view dispatch + 데이터 fetch trigger로 얇아진다.
- `ProjectSelectionContext`는 제거되고 active project slug는 view에서 derive한다. `SessionSelectionContext`도 `openSessionId`가 view로 흡수되고 `replyToEntryId`(session 내부 anchor)만 잔류한다.
- 데이터 entity(`projects`, `sessions`, `agentState`, `renderer`)는 그대로다 — selection이 아니라 fetch된 데이터다.
- mode가 project 진입마다 chat으로 리셋된다. templates/settings를 다녀와도 마찬가지다 — 의도된 결과.
