# ADR 0004: 세션은 JSONL tree 파일로 저장한다

Status: Accepted  
Date: 2026-04-25

## Context

Agentchan 대화는 선형 transcript가 아니라 branch 가능한 tree다. 사용자는
이전 노드에서 다시 이어갈 수 있고, compact session은 이전 session을
참조한다. 저장소는 end-user가 로컬에서 이해할 수 있는 단순한 파일이어야
한다.

현재 구현은 session 하나를 `sessions/{id}.jsonl` 파일 하나로 저장한다.

## Decision

세션 저장 포맷은 JSONL tree file로 유지한다.

- Header line: `{ _header: true, version, createdAt, provider, model, compactedFrom?, mode? }`
- Node line: `TreeNode` JSON
- Branch marker line: `{ _marker: "branch", nodeId, activeChildId }`

`mode`가 없으면 backward compatibility를 위해 creative session으로 간주한다.

`appendNode`와 `appendNodes`는 JSON line append다. `switchBranch`는 전체
파일을 rewrite하지 않고 branch marker를 append한다. `deleteSubtree`는 삭제
결과를 표현하기 위해 파일을 rewrite할 수 있다.

## Consequences

- 세션 파일은 사람이 읽고 diff할 수 있다.
- 일반 message append는 단순하고 crash recovery가 쉽다.
- Branch 선택 이력은 marker 누적 방식이라 오래된 marker가 남을 수 있다.
- Subtree delete는 append-only가 아니며 파일 rewrite 동작이다.
- Compact는 새 session을 만들고 header의 `compactedFrom`으로 이전 session을
  참조한다.

## Reconsider When

- session 파일이 너무 커져 branch marker replay나 tree parse 비용이 문제가
  된다.
- 동시 writer가 필요해 single JSONL file append/rewrite 모델이 깨진다.
- 외부 sync/merge를 위해 더 강한 event sourcing 포맷이 필요해진다.
