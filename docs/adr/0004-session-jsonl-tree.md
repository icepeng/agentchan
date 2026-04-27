# ADR 0004: 세션은 Pi-compatible SessionEntry JSONL로 저장한다

Status: Accepted
Date: 2026-04-27

## Context

Agentchan 대화는 선형 transcript가 아니라 branch 가능한 entry graph다. 사용자는
이전 지점에서 다시 이어갈 수 있고, compaction은 같은 대화의 일부로 표시된다.
저장소는 end-user가 로컬에서 이해할 수 있는 단순한 파일이어야 한다.

기존 결정은 Agentchan 자체 정의 JSONL tree 포맷이었다. 파일은 `_header` line +
`TreeNode` line + `_marker` line으로 구성됐고, branch 선택을 marker append로 영속화했다. 이 모델은 marker 누적, branch projection을 데이터 모델 안에 들고 다니는
부담, compaction을 새 세션 + `compactedFrom` 참조로 표현하는 ad-hoc 구조를 강요했다.

`@mariozechner/pi-coding-agent`는 이미 검증된 `SessionEntry` union, `SessionHeader`,
compaction/session_info/custom_message entry, free function `buildSessionContext`를 제공한다. Agentchan은 이걸 재사용하고 자체 모델을 폐기한다.

## Decision

세션 저장 포맷은 Pi-compatible `SessionEntry` JSONL이다.

- 첫 줄은 Pi `SessionHeader` 형태:
  `{ "type": "session", "version": 3, "id", "timestamp", "cwd", "parentSession?", "mode?" }`.
- `mode?: "creative" | "meta"` 는 Agentchan 헤더 확장이다. 미지정 시 creative로 해석한다. Pi `parseSessionEntries`는 `JSON.parse(line)` 하나만 호출하므로 unknown
  header field를 reject 없이 보존한다.
- 이후 줄은 Pi `SessionEntry` union (`message`, `compaction`, `session_info`,
  `custom_message`, `model_change`, `label` 등). Agentchan-only entry variant나
  projection은 추가하지 않는다.
- skill-load 같은 UI 마커는 `custom_message` entry로 저장한다 (`customType: "skill-load"`,
  `display: true`). Agentchan은 LLM history 재구성 시 해당 customType을 필터한다.
- branch는 파일에 영속화된 pointer가 아니다. 현재 branch는 `leafId`에서
  `parentId` chain을 따라 root까지 계산한 derived view다. `leafId`는 storage
  연산 입력일 뿐이며 영속 selection 상태가 아니다. 명시적 `leafId` 없이 세션을
  열면 마지막 append entry가 기본 leaf다.
- entry id, parentId, timestamp는 storage가 단독으로 배정한다. 호출자는 entry의
  본문(message, summary, customType 등)만 만든다.
- compaction은 같은 entry graph 위 `CompactionEntry` 한 줄로 표현한다. 새 파일
  생성과 `compactedFrom` 참조 모델은 폐기한다.
- usage는 assistant message의 `usage` 필드만 본다. 별도 rollup node나 사이드
  채널은 두지 않는다.

## Consequences

- branch marker 누적이 사라진다. 재방문 시 replay 비용 0.
- compaction이 한 파일 안에 머물러 list/title/usage 계산이 단일 파일 스캔으로
  닫힌다. `compactedFrom`이 만들던 세션 간 간접 참조도 사라진다.
- Pi의 `parseSessionEntries`, `migrateSessionEntries`, `buildSessionContext`,
  `getLatestCompactionEntry`를 그대로 import해서 쓴다. 자체 구현 부담 0.
- list endpoint는 각 세션 파일을 읽고 `AgentchanSessionInfo` (Pi `SessionInfo` +
  `mode`/`title`)를 derive한다. dev 규모에서는 충분하다. 인덱스 도입은 Reconsider
  When으로 보류한다.
- branch UX(이전 turn으로 점프, sibling 탐색, regenerate)는 모두 client-side
  `leafId` 갱신으로 처리하고 server는 `?leafId=` 쿼리만 받는다. `POST /branch`
  같은 mutation endpoint는 사라진다.
- 기존 dev 세션 파일(`_header`/`_marker`/`TreeNode`)은 호환 reader 없이
  드롭한다. 마이그레이션 스크립트나 dual-format 지원은 두지 않는다.

## Reconsider When

- 세션 파일 수가 많아져 list 응답이 느려진다 (manifest/index 도입 검토).
- 동시 writer가 필요해 single-file append 모델이 깨진다.
- Pi가 header에 unknown field를 reject하도록 schema를 강화한다 (mode를 첫 entry로
  강등해야 함).
- Agentchan 고유 메타데이터가 많아져 header `mode` 한 필드만으로는 부족해진다.
