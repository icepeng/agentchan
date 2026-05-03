# Session usage는 세션 전체 derive, Branch 무관

사용자에게 표시하는 cost·token totals는 **Session** 파일 전체의 모든 persisted assistant **Session entry**의 **Usage** 합(**Session usage**)으로 derive한다 — 활성 **Branch** 누적이 아니다. **Branch** 누적은 leaf 전환마다 절대값이 변해 "폐기한 **Branch**의 비용이 사라진 것처럼" 보이고, 사용자 멘탈 모델("세션 가격" = 청구액)과 어긋난다.

## Consequences

- **Compaction**의 LLM 호출은 현재 `CompactionEntry`에 `usage` 필드가 없어 **Session usage** 합에서 누락된다 — pi 측 schema 의도 확인 후 처리할 known gap이며, 그때까지 "**Session usage** = 청구액"이라고 단정하지 않는다.
