# ADR 0004: 세션은 SessionEntry JSONL entry graph로 저장한다

Status: Accepted  
Date: 2026-04-26

## Context

Agentchan 대화는 선형 transcript가 아니라 branch 가능한 session이다. 사용자는
이전 지점으로 이동해 다시 이어갈 수 있고, Web UI는 session list, 현재 branch,
message list, usage, compact 결과를 표시해야 한다.

이전 결정은 Agentchan 전용 JSONL tree 파일을 사용했다. 파일은 header line,
`TreeNode` line, branch marker line으로 구성됐고, branch 선택 상태도 marker
append로 저장했다. 이 방식은 Agentchan이 tree replay, active child marker,
subtree rewrite, message projection을 직접 유지하게 만든다.

Pi `SessionManager`는 검증된 entry graph와 branch 연산을 제공하지만, Agentchan
Web UI server는 request 사이에 manager 인스턴스를 오래 유지하지 않는다. 세션
파일이 canonical state여야 하며, 생성 직후와 user append 직후에도 파일을 다시
열 수 있어야 한다.

## Decision

세션 저장 포맷은 Pi-compatible `SessionEntry` JSONL entry graph로 둔다.

- Header line은 Pi header 형태를 따른다:
  `{ type: "session", version, id, timestamp, cwd, parentSession?, mode? }`
- `mode`는 Agentchan header extension이다. 생략하면 `creative`로 해석한다.
- Entry line은 Pi `SessionEntry` union을 따른다.
- Agentchan `TreeNode`, `activePath`, branch marker는 저장 모델로 사용하지 않는다.
- 현재 branch는 저장된 active pointer가 아니라 `leafId`에서 root까지의
  `parentId` chain으로 계산한다.
- `leafId`는 durable session selection state가 아니라 연산 입력이다.
- 명시적 `leafId` 없이 세션을 열면 마지막 append entry를 기본 leaf로 사용한다.
- 사용자가 과거 지점에서 이어 쓰면 append 직전에 해당 entry를 leaf로 선택하고,
  새 entry는 그 leaf의 child로 붙는다.
- branch preview는 파일에 쓰지 않고 `entries + leafId`에서 계산한 local selector
  결과로 표현한다. `branch`는 API/cache의 canonical field가 아니다.
- durable fork가 필요하면 같은 파일 안에 marker를 저장하지 않고 새 session file을
  만든다.
- compact는 같은 entry graph 위의 `compaction` entry로 표현한다.
- session title/name은 `session_info`, user-facing marker는 `label`에 둔다.
- Agentchan 전용 확장은 header의 `mode`만 사용한다. Entry graph에는 Agentchan-only
  projection/custom entry를 추가하지 않는다.
- assistant usage는 assistant message의 `usage`에서 읽고 중복 저장하지 않는다.

Agentchan은 다음 연산 집합을 명시적으로 소유한다.

- session list/read/create/delete
- entry append와 append-at-leaf
- entry lookup
- branch projection by leaf
- LLM context build from leaf branch
- Web UI detail/cache state `{ entries, leafId }`
- branch projection selector `branchFromLeaf(entries, leafId)`
- compact/fork/regenerate 정책

Pi `SessionManager`와 관련 타입은 참고 구현과 호환 대상으로 본다. Agentchan
runtime은 Pi `SessionManager`의 private persistence state에 의존하지 않는다.

Session mode는 ADR 0005에 따라 creative/meta를 계속 구분한다. Mode는 Agentchan
project contract에 속하며, header의 최소 metadata로 보존한다.

## Consequences

- 세션 파일은 Pi entry model과 호환 가능한 방향으로 단순해진다.
- Agentchan 전용 tree node, active child marker, branch marker replay 책임을
  제거한다.
- Web UI branch 클릭만으로는 reload 후 선택 상태가 영속되지 않는다. 영속되는 것은
  실제 append가 발생한 branch다.
- reload 기본 branch는 마지막 append entry의 path가 된다.
- branch 선택 UX는 저장 포맷이 아니라 client state와 request `leafId` 계약으로
  해결한다.
- Agentchan server는 request 간 long-lived `SessionManager` 인스턴스에 의존하지
  않는다.
- 생성 직후와 user append 직후에도 세션 파일은 재오픈 가능해야 한다.
- 기존 Agentchan JSONL tree session은 지원하지 않는다. 전환 중 개발 데이터는 새
  형식으로 다시 만든다.
- subtree delete는 append-only entry graph와 맞지 않으므로 제품 기능에서 제거한다.

## Reconsider When

- 같은 세션 파일 안에서 순수 branch selection을 reload 후에도 반드시 복원해야
  하는 강한 제품 요구가 생긴다.
- Agentchan의 branch/fork UX가 entry graph의 "durable fork는 새 session" 모델과
  충돌한다.
- Pi `SessionManager`가 stateless Web UI server에 필요한 public persistence API를
  제공해 Agentchan의 entry graph 연산을 대체할 수 있다.
- 외부 sync/merge 또는 동시 writer 요구 때문에 single JSONL append model만으로
  충분하지 않다.
