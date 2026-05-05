# Session은 Pi-compatible SessionEntry JSONL로 저장한다

Session은 Pi-compatible `SessionEntry` JSONL 파일로 저장한다. 첫 줄은 Pi session header 형태를 따르며, Agentchan 확장으로 `mode?: "creative" | "meta"` 필드만 더 둔다. 이후 줄은 Pi entry union을 그대로 사용하고 Agentchan 전용 entry variant나 projection entry를 추가하지 않는다.

Branch는 leaf id에서 `parentId` chain을 root까지 따라가 derive하는 view다. Leaf 없이 Session을 열면 마지막 append entry가 기본 leaf다. Branch UX(이전 응답 지점으로 점프, sibling 탐색, regenerate)는 client-side leaf 갱신으로 표현하고, server는 leaf id query를 받는다.

Compaction은 같은 entry graph 안의 `CompactionEntry` 한 줄로 저장한다. Skill 활성화는 user message 본문에 `<skill_content name="...">...</skill_content>` 태그를 임베드하고, UI에선 prefix split으로 분리해서 렌더한다.

Motivation: Agentchan Session은 분기 가능한 entry graph다. User는 임의 지점에서 다시 이어갈 수 있고, Compaction은 같은 Session의 일부로 표시되어야 한다. 저장소는 User가 로컬에서 열어봐도 이해할 수 있는 append-only 파일이어야 한다. 이 요구사항을 만족하는 `SessionEntry` 모델이 `pi-coding-agent`에 구현되어 있다.

## Considered Options

- **Agentchan 자체 JSONL 포맷 유지**: 기각. `_header`, `TreeNode`, `_marker` 줄이 한 파일에 섞이고, branch projection과 marker 누적을 별도로 관리해야 한다.
- **Branch 선택을 marker append로 영속화**: 기각. Session을 재방문할 때마다 marker 줄을 다시 훑어 현재 projection을 복원해야 한다.
- **Compaction을 새 Session 파일로 저장하고 원본을 `compactedFrom`으로 참조**: 기각. 같은 대화의 일부인 Compaction이 세션 사이의 ad-hoc 간접 참조로 흩어진다.
- **Agentchan 전용 entry variant 추가**: 기각. Pi-compatible entry union을 벗어나면 공유 가능한 reader와 storage 모델이 갈라진다.

## Consequences

- 같은 파일 한 번 스캔으로 list, title, usage 계산이 닫힌다.
- 세션 list endpoint는 각 파일을 읽어 mode/title 등을 derive한다. 현재 규모에서는 충분하다. 세션 수가 충분히 늘면 manifest/index 도입이 필요하다(reconsider).
- 기존 dev 단계 세션 파일(`_header` / `_marker` / `TreeNode`)은 호환 reader 없이 드롭한다. Migration script도 dual-format 지원도 두지 않는다.
