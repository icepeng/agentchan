# 0009. Web UI navigation은 단일 view discriminated union으로 한다

Status: Accepted
Date: 2026-05-02

## Context

Web UI는 page 전환(main / templates / settings)을 `UIContext.currentPage`,
active project를 `ProjectSelectionContext.activeProjectSlug`, 프로젝트별 마지막
세션을 `SessionSelectionContext.openSessionId`, chat/edit 토글을
`UIContext.viewMode`로 *각각 다른 context에서* 보관해 왔다. 그 결과 cross-domain
transition은 caller가 두 개 이상의 dispatch를 *직접 묶어 호출해야* 했고, 한
쪽을 잊으면 화면이 어긋났다 — templates 페이지에 있는 동안 사이드바의 프로젝트
탭을 눌러도 active project만 바뀌고 페이지는 templates에 머무르는 회귀가 그
예다.

이 클래스의 회귀를 라우터 라이브러리 도입(react-router/@tanstack/router) +
URL을 SSoT로 올리는 모델로 풀 수 있는지 검토했다. 결론은 채택하지 않는다.

- agentchan은 작품 단위 데스크톱-스타일 챗 앱이고, Tauri/electrobun으로 webview
  wrapping될 가능성이 있다. 브라우저 뒤로가기/딥링크/공유 같은 URL 진영의 효용은
  이 형태에서 약하다.
- 같은 진영의 제품(SillyTavern 등)은 URL을 쓰지 않는다. 반대로
  open-webui/LibreChat/ChatGPT/claude.ai는 conversation id까지 URL에 올려 SSoT로
  쓴다 — 이 라인은 웹 우선 multi-tenant 챗 인터페이스의 전형이며 우리 형태와
  맞지 않는다.
- 진짜 결함은 *URL 부재*가 아니라 *view-determining state가 한 곳에 모이지
  않은 것*이다. URL을 도입해도 selection을 URL 밖에 두면 같은 회귀가 다시 난다.

## Decision

Web UI navigation은 단일 view discriminated union을 보관하는 reducer로 한다.

```ts
type View =
  | { kind: "templates" }
  | { kind: "settings"; tab: "appearance" | "api-keys" }
  | { kind: "project"; slug: string; session: string | null; mode: "chat" | "edit" };

type ViewState = {
  view: View;
  sessionMemory: Map<string /* slug */, string /* sessionId */>;
};
```

- 모든 transition은 한 번의 dispatch로 끝난다. 예: `OPEN_PROJECT(slug)`는
  `view.kind`, `view.slug`, `view.session`(sessionMemory lookup), `view.mode`(항상
  `"chat"`로 시작)를 동시에 결정한다.
- viewMode는 `kind: "project"` 안으로 흡수한다. templates/settings view에서는
  type level에 mode 필드가 없다. AppShell의 `page === "main" && viewMode ===
  "chat"` 같은 다중 조건 결합 검사가 `view.kind === "project"` narrow 한 줄로
  무너진다. Ctrl+E 가드도 동일하게 narrow된다.
- sessionMemory는 보관한다 — *작품 안에서의 위치*는 작업의 연속성이고, 작품을
  다시 열 때 마지막 세션이 복원되어야 한다. 반면 mode memory(글로벌 lastMode 또는
  per-project modeMemory)는 두지 않는다 — *작업 의도 토글*은 view를 떠나면 같이
  끝나는 게 자연스럽다. 이 비대칭이 두 메모리의 의미 차이를 명시한다.
- URL은 SSoT가 아니다. history API도 라우터 라이브러리도 도입하지 않는다.
  새로고침 시 view 복원도 하지 않는다 (`localStore.lastProject`만 부트스트랩에
  남는다).
- entity context 정리:
  - `ProjectSelectionContext`는 제거한다. `activeProjectSlug`는
    `view.kind === "project" ? view.slug : null`에서 derive한다.
  - `SessionSelectionContext`에서 `openSessionId`는 view로 흡수한다.
    `replyToEntryId`만 잔류한다 — 이는 session 내부 anchor이지 view-determining이
    아니다.
  - 데이터 entity(`projects`, `sessions`, `agentState`, `renderer`)는 그대로다.
    selection이 아니라 fetch된 데이터다.

## Consequences

- cross-domain transition은 한 줄 dispatch가 되고, 호출자가 page와 selection을
  *동시에* 잊을 자리가 사라진다. 이 ADR을 만든 회귀(P1) 클래스가 구조적으로
  닫힌다.
- `useProject.selectProject`의 4-domain orchestration이 reducer 내부로 흡수되며,
  features layer hook은 view dispatch + 데이터 페치 트리거로 얇아진다.
- URL을 안 쓰므로 SillyTavern과 같은 *새로고침 시 holding screen* 약점을 그대로
  들여온다. 새로고침이 흔치 않은 데스크톱-스타일 사용 패턴 위에 서 있다.
- mode가 project 진입마다 `chat`으로 리셋된다. templates/settings를 다녀와도
  마찬가지다. 이는 의도된 결과다.

## Reconsider When

- 새로고침/dev reload 빈도가 늘어 holding screen이 실질적 약점이 된다 — view를
  localStorage에 직렬화/복원하는 옵션 검토. reducer 내부 변경에 한정되므로 비용은
  작다.
- 외부에서 "이 작품의 이 세션을 직접 열기" deep link/공유 use case가 등장한다 —
  URL을 SSoT로 올리는 진영(open-webui/LibreChat 라인)으로 전환 검토. 이 ADR을
  supersede.
- 사용자 시그널이 "프로젝트마다 mode를 따로 기억하길 원한다"로 굳어진다 —
  modeMemory를 sessionMemory와 같은 결로 추가. ADR 갱신 불필요한 점진 변경.
- view 분기가 늘어 reducer case가 가독성 한계를 넘는다 — actor framework(xstate
  등) 검토.
