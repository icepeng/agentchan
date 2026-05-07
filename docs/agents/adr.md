# ADR 작성 규칙

- 새 ADR 후보가 떠오르면 먼저 **"이 결정이 외부 계약(Renderer 작성 계약, Project folder 계약, Session 파일 포맷, 도메인 카테고리 경계 등)을 건드리는가?"** 를 묻는다. 외부 visible이 아니면 ADR-worthy 가능성이 극히 낮아진다.
- 제목은 가능하면 짧은 주제명으로 둔다. 제목에서 모든 결론을 설명하려 하지 않는다.

## 본문

- 첫 문단은 채택한 계약의 최소 구조를 쓴다. 누가 무엇을 작성/저장/export/호출/읽는지 구체적으로 적는다.
- 구현 산출물의 detail(파일 수, byte 크기, `.gitattributes` 설정, internal path tree 같은 구체 규격)은 본문에 적지 않는다. 본문은 의사결정의 contract만 적고, detail은 PR이나 commit이 보여준다.
- 추상어를 피한다. `surface`, `tolerance`, `플랫폼`, `레이어`처럼 독자가 다시 해석해야 하는 말보다 `작성 계약`, `runtime 계약`, `entrypoint`, `named export`, `파일 포맷`, `Tool 목록`, `Project folder 경계`처럼 실제 명사를 쓴다.
- Motivation은 이 결정을 만든 압력만 설명한다. 기각한 선택지의 실패 이유를 미리 반복하지 않는다. 기존 구현의 mechanism detail(`두 단계 build`, `mutable alias 패치`, `marker로 ensure` 같은 동작 방식)도 압력이 아니라 detail이므로 적지 않는다.

## Optional Sections

- Optional Sections는 본문의 내용을 paraphrasing만 해서 다시 작성하지 않는다. 이 규칙을 따랐을 때 작성할 게 없다면, 그 섹션이 필요없다는 뜻이다.
- **Considered Options**는 기각하거나 보류한 선택지를 다시 제안하지 않도록 남길 가치가 있을 때만 쓴다. 본문에서 이미 말한 기각 논리를 여기서 반복하지 말고, 둘 중 한 곳에만 둔다. 본문 결정의 정반대(본문이 "X 해체"면 "X 유지")는 motivation에 이미 흡수되었으므로 별도 옵션으로 두지 않는다.
- **Consequences**는 결정 때문에 구현/UX/계약에서 따라오는 비자명한 결과만 쓴다. 본문 계약을 다른 말로 다시 쓰는 목록은 제거한다.
- **Reconsider When**은 외부 가정(product 요구, 외부 라이브러리 메이저 변경, 도메인 변화)이 깨지는 경우만 적는다. Consequences에 이미 mitigation을 적은 항목은 reconsider 사유가 아니다.
