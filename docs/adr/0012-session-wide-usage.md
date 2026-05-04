# Session usage는 session 전체에서 derive한다 — branch 선택과 무관하다

User에게 표시하는 Session의 cost / token 누적값(=session usage)은 *Session 파일 전체*의 모든 persisted assistant entry의 usage 합이다 — 현재 활성 Branch의 누적이 아니다.

Branch 누적은 *직관적*으로 보이지만 User 멘탈 모델과 어긋난다. session usage = "이 Session에 청구된 가격"으로 읽는 게 자연스럽고, 그건 청구 시점의 누적이지 현재 어느 Branch를 보고 있느냐의 함수가 아니다. Branch 누적을 표시하면 leaf 전환마다 절대값이 변하고, 폐기한 Branch의 비용이 *사라진 것처럼* 보인다 — 그런데 그 비용은 이미 청구된 후라 사라지지 않는다(Branch 폐기는 view 변화이지 환불이 아니다). 청구액과 표시값의 신호가 어긋나면 "이 Session이 얼마나 비싼가"를 묻는 User에게 잘못된 답을 주는 셈이다.

## Consequences

- Session usage는 persisted session file에서 derive한 값이며, in-memory agent state와 같은 store에 두지 않는다.
- session usage = 청구액 가정에는 known gap이 하나 있다 — compaction의 LLM 호출은 현재 `CompactionEntry`에 usage 필드가 없어 합에서 누락된다. Pi 측 schema 의도 확인 후 처리할 영역이며, 그때까지 "session usage = 청구액"이라고 단정하지 않는다.
- branch별 누적이 필요한 분석 use case는 별도 view로 분리한다 — primary session usage 표시값과 섞지 않는다.
