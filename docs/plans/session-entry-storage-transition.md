# SessionEntry Storage Transition

Date: 2026-04-26

## Goal

Agentchan session 파일의 canonical 저장 모델을 Agentchan 전용 tree JSONL에서
Pi-compatible `SessionEntry` JSONL entry graph로 전환한다.

## Decisions

- Pi `SessionEntry` 타입을 저장 계약으로 직접 사용한다.
- Pi `SessionManager` 인스턴스는 Agentchan runtime foundation으로 쓰지 않는다.
- Header는 Pi header 형태를 따르되 `mode?: "creative" | "meta"` Agentchan 확장을
  허용한다.
- Branch selection은 파일에 저장하지 않는다. `leafId`가 없으면 마지막 append entry가
  기본 leaf다.
- Subtree delete는 제거한다.
- 기존 Agentchan tree/branch marker 파일은 지원하지 않는다.
- Web UI detail/cache shape은 `{ entries, leafId }`다. `branch`는 항상
  `branchFromLeaf(entries, leafId)`로 파생한다.

## Implementation Checklist

- [x] ADR 0004를 `SessionEntry` 저장 모델로 갱신한다.
- [x] `@mariozechner/pi-coding-agent` type dependency를 추가한다.
- [x] `packages/creative-agent/src/session/format.ts`를 `SessionEntry` parser/projector로
  바꾼다.
- [x] `packages/creative-agent/src/session/storage.ts`의 canonical write path를
  `SessionEntry` append로 바꾼다.
- [x] `/sessions/:id` 응답에 `{ entries, leafId }`를 제공한다.
- [x] branch 선택 API를 제거하고 client-side `leafId` 선택으로 바꾼다.
- [x] delete subtree route/API를 제거하거나 명시적으로 unsupported로 바꾼다.
- [x] session format/storage 테스트를 새 모델로 갱신한다.
- [x] `bunx tsc --noEmit`과 좁은 session 테스트를 실행한다.

## Verification

- `bunx tsc --noEmit` 통과.
- `cd packages/creative-agent && bun test tests/session` 통과.
- 변경 파일 대상 `node --max-old-space-size=4096 ./node_modules/eslint/bin/eslint.js ...` 통과.
- `bun run lint`는 Bun/ESLint 프로세스가 시작 직후 OOM으로 종료되어 완료하지 못했다.

## Follow-Up Work

### 1. Web UI session state를 `SessionEntry` 중심으로 전환

Status: 완료 (2026-04-27)

Client primary state를 `entries + leafId`로 바꾼다.

작업:

- session detail cache는 `SessionEntry[]`와 `leafId`만 저장한다.
- message list와 usage 계산은 `branchFromLeaf(entries, leafId)` 결과에서 읽는다.
- `useStreaming` optimistic update는 temp `SessionMessageEntry`를 삽입한다.
- assistant/tool result append SSE도 `SessionEntry` 기반 event로 바꾸거나, 최소한
  수신 즉시 entry로 normalize한다.
- cache seeding은 `{ entries, leafId }`만 사용한다.

완료 조건:

- `/sessions/:id` 응답의 `{ entries, leafId }`만으로 Web UI가 동작한다.
- branch 선택 후 reload하면 기본 branch가 마지막 append entry path로 돌아간다.
- branch 선택 후 메시지를 보내면 새 entry가 선택 leaf의 child로 append된다.

검증:

- `bunx tsc --noEmit`
- `cd packages/creative-agent && bun test tests/session`
- 변경 파일 대상 ESLint:
  `node --max-old-space-size=4096 ./node_modules/eslint/bin/eslint.js <changed files>`
- `SERVER_PORT=3001 CLIENT_PORT=4101 bun run --cwd apps/webui dev:local`
- agent-browser 수동 흐름:
  - 새 session 생성
  - 메시지 2회 전송
  - 첫 user entry에서 branch 선택
  - 다른 메시지 전송
  - reload 후 마지막 append branch가 기본으로 보이는지 확인

### 2. `/compact`를 same-file `compaction` entry로 전환

Status: 완료 (2026-04-27)

현재 `/compact`는 새 session을 만들고 summary bootstrap message를 넣는다. ADR 0004
결정에 맞춰 같은 session 파일에 Pi `compaction` entry를 append하고, context build가
그 entry를 해석하도록 바꾼다.

작업:

- `packages/creative-agent/src/session/storage.ts`에 leaf 검증을 포함한
  `appendEntriesAtLeaf`와 `appendCompaction` 저장 연산을 둔다.
- `packages/creative-agent/src/agent/lifecycle.ts`의 `compactSession`이 새 session을
  만들지 않고 현재 leaf 뒤에 `compaction` entry를 append하도록 변경한다.
- `firstKeptEntryId`, `tokensBefore`, `summary` 계산을 Pi `buildSessionContext`
  semantics와 맞춘다.
- compact 결과 API는 `{ entries, leafId, compactionEntryId }`를 반환하도록 바꾼다.
- compact summary UI는 `compaction` entry를 렌더링하는 entry bubble로 옮긴다.

완료 조건:

- compact 후 session id가 바뀌지 않는다.
- JSONL 파일에 `type: "compaction"` entry가 append된다.
- compact 이후 LLM context는 summary + kept entries + post-compact entries로 구성된다.
- 별도 Agentchan-only compact metadata가 새 compact 경로에서 생성되지 않는다.

검증:

- `bunx tsc --noEmit` 통과.
- `cd packages/creative-agent && bun test tests/session` 통과.
- 변경 파일 대상 ESLint 통과.
- `git diff --check` 통과.
- compact 전용 테스트 추가:
  - compaction entry append shape
  - branchFromLeaf가 compaction entry를 포함
  - LLM context build가 compaction summary를 포함
- Web UI 수동 확인:
  - 긴 대화 생성
  - `/compact` 실행
  - 같은 session tab에서 summary가 보이고 다음 메시지가 이어지는지 확인
  - session 파일에 새 session file이 생기지 않았는지 확인

### 3. API naming을 `entryId`/`leafId`로 정리

Status: 완료 (2026-04-27)

request/response 명칭을 entry graph 기준으로 맞춘다.

작업:

- `POST /sessions/:id/messages` body는 `leafId`를 쓴다.
- `POST /sessions/:id/regenerate` body는 `entryId`를 쓴다.
- `POST /sessions/:id/branch`는 제거한다.
- client branch click은 서버 mutation 없이 cache의 `leafId`만 바꾼다.

완료 조건:

- Web UI client/server 코드에서 chat session id 명칭은 `entryId`/`leafId`만 쓴다.
- branch selection mutation API가 남지 않는다.
- renderer/editor file tree 같은 다른 도메인은 영향받지 않는다.

검증:

- `rg -n "parentNodeId|userNodeId|nodeId" apps/webui/src packages/creative-agent/src`
  결과 없음.
- `bunx tsc --noEmit` 통과.
- `cd packages/creative-agent && bun test tests/session` 통과.
- 변경 파일 대상 ESLint 통과.
- `git diff --check` 통과.
- Web UI 실제 플로우 확인:
  - 로컬 OpenAI-compatible mock provider로 새 session 생성 후 메시지 2회 전송.
  - 첫 user entry에서 branch reply 전송.
  - branch assistant 응답 regenerate 실행.
  - JSONL에서 branch reply user entry의 `parentId`가 첫 user entry id이고,
    regenerate assistant entry의 `parentId`가 branch user entry id임을 확인.

### 4. Session title/name을 `session_info` 기반으로 노출

Status: 완료 (2026-04-27)

`deriveSession`은 이미 최신 `session_info` entry를 title로 사용할 수 있다. UI에서
이 모델을 편집/표시하는 흐름은 아직 정리되지 않았다.

작업:

- session rename UI가 있다면 `session_info` entry append로 저장하도록 바꾼다.
- rename UI가 없다면 session tab title이 `session_info`를 우선 사용하고, 없으면 첫
  user message derive title을 쓰는지 확인한다.
- 명시적 empty name이 title clear인지, derive title fallback인지 정책을 정한다.

완료 조건:

- session list와 tab title이 같은 title source를 사용한다.
- reload 후 rename 결과가 유지된다.
- title 변경은 message branch와 독립적인 session-level append로 남는다.

검증:

- `bunx tsc --noEmit` 통과.
- `cd packages/creative-agent && bun test tests/session` 통과.
- 변경 소스 파일 대상 ESLint 통과.
  - 테스트 파일은 현재 ESLint project service tsconfig 범위 밖이라 파싱 단계에서 제외하고,
    `bun test tests/session`으로 검증했다.
- `git diff --check` 통과.
- session rename 저장 테스트 추가:
  - `appendSessionInfo`가 `session_info` entry를 append한다.
  - session list와 reload detail이 같은 `session_info` title을 노출한다.
  - 최신 empty `session_info.name`은 명시 이름 clear로 보고 첫 user message derive title로
    fallback한다.
- Web UI 실제 흐름 확인:
  - `SERVER_PORT=3001 CLIENT_PORT=4101 bun run --cwd apps/webui dev:local`
  - 테스트 프로젝트/세션 생성 후 session tab에서 `New session`을 `Session Info Rename`으로 변경.
  - reload 후 tab title이 `Session Info Rename`으로 유지됨.
  - API list/detail title이 모두 `Session Info Rename`으로 일치.
  - JSONL 마지막 entry가 `{ type: "session_info", name: "Session Info Rename" }`임을 확인.

### 5. Compatibility projection 제거

Status: 완료 (2026-04-27)

위 작업들이 끝나면 이전 저장 모델 adapter를 제거한다.

작업:

- SessionEntry가 아닌 chat/session 전용 projection type과 변환 함수를 제거한다.
- SSE event type은 entry event만 쓴다.
- `packages/creative-agent/tests/session/tree.test.ts`는 entry branch projection 테스트만
  유지한다.
- `docs/plans/session-entry-storage-transition.md`를 완료 상태로 갱신한다.

완료 조건:

- session/chat 저장 및 API 코드에서 Agentchan-only projection type import가 없다.
- JSONL 저장 경로가 `SessionEntry` 외 shape를 쓰지 않는다.
- branch 선택 상태를 저장하는 코드가 없다.

검증:

- cleanup 검색 결과 검토 완료.
  - `packages/creative-agent/src`와 session/chat API 코드에는 이전 저장 모델 adapter 참조가
    남지 않음.
- `bunx tsc --noEmit` 통과.
- `cd packages/creative-agent && bun test tests/session` 통과.
- 변경 소스 파일 대상 ESLint 통과.
- `git diff --check` 통과.
