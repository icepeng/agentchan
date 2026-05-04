# Session은 Pi-compatible SessionEntry JSONL로 저장한다

Agentchan 대화는 선형 transcript가 아니라 *분기 가능한* entry graph다. User는 임의 지점에서 다시 이어갈 수 있고, compaction(이전 대화를 LLM 요약으로 대체)은 같은 대화의 일부로 표시되어야 한다. 저장소는 User가 로컬에서 열어봐도 이해할 수 있는 단순한 파일이어야 한다.

기존 Agentchan 자체 포맷은 한 파일 안에 `_header` 줄 + `TreeNode` 줄 + `_marker` 줄이 섞이는 구조였다. branch 선택은 marker append로 영속화했고, compaction은 새 세션 파일을 만들어 원본을 `compactedFrom`으로 참조했다. 이 모델은 marker 누적(재방문 시 marker 줄을 다시 훑어야 했음), branch projection을 데이터 모델에 들고 다니는 부담, compaction이 세션 사이를 넘는 ad-hoc 간접 참조 — 셋 모두를 직접 관리해야 했다. 같은 시기 `pi-coding-agent`가 이미 검증된 entry union·session header·compaction entry variant를 가지고 있었다.

세션 저장 형식은 Pi-compatible SessionEntry JSONL로 잡는다. 첫 줄은 Pi session header 형태에 Agentchan 확장으로 `mode?: "creative" | "meta"` 한 필드만 더 둔다. 이후 줄은 Pi entry union을 그대로 쓰며, Agentchan 전용 entry variant나 projection은 추가하지 않는다.

Branch는 파일에 영속화하지 않는다. 현재 leaf id에서 `parentId` chain을 root까지 따라가 derive하는 *view*다. leaf id는 storage 연산 입력일 뿐 영속 selection이 아니며, leaf 없이 세션을 열면 마지막 append entry가 기본이다. branch UX(이전 응답 지점으로 점프, sibling 탐색, regenerate)는 모두 client-side leaf 갱신이며 server에는 mutation endpoint가 없고 leaf id query만 받는다.

Compaction도 새 파일이 아니라 같은 entry graph 안의 한 줄(`CompactionEntry`)이다. 같은 파일 한 번 스캔으로 list / title / usage 계산이 모두 닫힌다. Skill 활성화도 별도 entry variant가 아니라 user message 본문에 `<skill_content name="...">…</skill_content>` 태그를 임베드하는 식이다 — LLM은 그 message를 그대로 replay하고, UI는 prefix split해 분리해서 렌더한다.

## Consequences

- 세션 list endpoint는 각 파일을 읽어 mode/title 등을 derive한다. 현재 규모에서는 충분하다 — 세션 수가 충분히 늘면 manifest/index 도입이 필요하다(reconsider).
- 기존 dev 단계 세션 파일(`_header` / `_marker` / `TreeNode`)은 호환 reader 없이 드롭한다. Migration script도 dual-format 지원도 두지 않는다.
