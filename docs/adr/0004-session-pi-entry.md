# ADR 0004: 세션 영속화는 Pi SessionManager entry model을 따른다

Status: Accepted  
Date: 2026-04-26

## Context

Agentchan 대화는 branch 가능한 session이다. 사용자는 이전 지점으로 이동해 다시
이어갈 수 있고, Web UI는 session list, 현재 branch, message list, usage,
compact 결과를 표시해야 한다.

이전 결정은 Agentchan 전용 JSONL tree 포맷을 사용했다. 파일은 header, node,
branch marker line으로 구성됐고, branch 선택 상태도 marker append로 저장했다.
이 방식은 Agentchan 구현을 직접 유지해야 하고, compact, fork, retry, queue,
extension state 같은 범용 agent runtime 기능을 계속 자체 구현하게 만든다.

Agentchan의 목표는 세션 저장 포맷의 하위호환을 지키는 것이 아니라, agent
runtime foundation을 가능한 한 Pi의 검증된 모델에 맞추는 것이다.

## Decision

Agentchan의 세션 영속화와 branch 관리는 Pi `SessionManager`의 JSONL entry model을
기준으로 한다.

- 세션 파일은 Pi session header와 append-only entry로 저장한다.
- Agentchan `TreeNode`, `activePath`, branch marker는 저장 모델로 사용하지 않는다.
- Web UI/server 계약은 Pi entry graph에서 계산한 `{ info, entries, branch, leafId }`
  projection을 사용한다.
- 세션 로드시 기본 branch는 Pi처럼 현재 leaf에서 root로 역산한다.
- 명시 leaf가 없으면 Pi `SessionManager`의 현재 leaf를 따른다. 파일 reopen 후
  현재 leaf는 마지막 append entry 기준으로 복원된다.
- 마지막 entry가 label, custom, session info 같은 non-message entry면 Web UI의
  visible branch는 가장 가까운 표시 가능한 ancestor까지로 계산한다.
- 순수 branch 선택 상태는 세션 파일에 저장하지 않는다.
- Web UI에서 사용자가 선택한 branch는 client state 또는 prompt request의 `leafId`
  로 전달한다.
- 선택된 branch에서 prompt를 보내면 서버가 append 직전에 명시적 `leafId`가 있을 때만
  `SessionManager.branch(leafId)`를 적용한다. 명시적 parent가 없으면 현재 Pi leaf에
  append하며, append 이후에는 그 branch가 최신 leaf가 되어 자연스럽게 영속된다.
- durable fork/regenerate가 필요해지면 같은 파일 안에 active child marker를
  저장하지 않고 Pi `SessionManager.createBranchedSession()`처럼 새 세션으로 만든다.
- compact는 Agentchan meta node가 아니라 Pi compaction semantics에 맞춘 entry로
  표현한다.
- session title/name은 Pi `session_info`, user-facing marker는 Pi `label`을 우선
  사용한다.
- LLM context에 들어가지 않는 Agentchan 고유 상태가 필요할 때만 Pi `custom` entry를
  사용한다. LLM context에 들어가는 확장 메시지는 `custom_message`로 분리한다.
- assistant usage는 Pi assistant message의 `usage`를 projection한다. 별도
  Agentchan node usage를 중복 저장하지 않는다.

Session mode는 ADR 0005에 따라 creative/meta를 계속 구분한다. Mode는 Agentchan
project contract에 속하며, Pi entry model 위에 필요한 최소 metadata로 보존한다.

## Consequences

- Agentchan은 자체 session tree 포맷, branch marker replay, subtree rewrite
  책임을 줄인다.
- Web UI branch 클릭만으로는 reload 후 선택 상태가 영속되지 않는다. 영속되는 것은
  실제 append가 발생한 branch다.
- reload 기본 branch는 "마지막으로 append된 entry의 path"가 된다.
- branch 선택 UX는 저장 포맷이 아니라 client state/request `leafId` 계약으로
  해결한다.
- 기존 Agentchan JSONL session은 Pi entry model로 migration/import하거나 legacy
  read-only 대상으로 격리해야 한다.
- subtree delete는 Pi append-only model의 기본 동작이 아니므로 제품 기능으로
  유지할지 별도로 결정해야 한다.
- compact 이후 context usage는 Pi의 compaction semantics를 따른다. 필요하면 다음
  assistant response 전까지 정확한 context token을 알 수 없는 상태를 UI가 표현한다.

## Reconsider When

- 같은 세션 파일 안에서 pure branch selection을 반드시 reload 후에도 복원해야 하는
  강한 제품 요구가 생긴다.
- Agentchan의 branch/fork UX가 Pi의 "durable fork는 새 session" 모델과 충돌한다.
- Pi `SessionManager` entry model이 project/session URL 구조나 packaged executable
  배포 조건을 과도하게 왜곡한다.
- 외부 sync/merge 또는 동시 writer 요구 때문에 Pi append-only entry model만으로
  충분하지 않다.
