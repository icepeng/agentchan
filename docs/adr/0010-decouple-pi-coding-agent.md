# ADR 0010: Session schema와 helper는 Pi에서 분리해 Agentchan이 소유한다

Status: Accepted
Date: 2026-05-02

## Context

ADR-0004는 Agentchan 세션을 Pi-compatible `SessionEntry` JSONL로 저장한다고
결정하면서, 그 모델을 제공하는 `@mariozechner/pi-coding-agent`의 함수를 직접
import해 쓴다는 방침을 같이 못 박았다 ("자체 구현 부담 0").

이 가정은 standalone executable 빌드에서 깨졌다. pi-coding-agent의 `src/config.ts`가
module top-level에서 자기 binary 옆 `package.json`을 `readFileSync`하는데,
컴파일된 agentchan exe를 시작하면 그 파일이 없어 ENOENT로 crash한다. agentchan
코드가 해당 함수를 호출하지 않아도 ESM evaluation은 import 그래프만 따라가도
top-level을 실행한다.

근본 원인은 *application을 library로 취급한 카테고리 오류*다. pi-coding-agent는
standalone CLI agent application이고, 그 module 초기화 코드는 *자기 binary*를
위한 것이다. agentchan이 dep로 끌어다 쓰면서 그 가정이 위반됐다. CLAUDE.local.md는
이미 "agentchan이 직접 의존하는 것은 `pi-ai` + `pi-agent-core`"로 그 boundary를
그어놓고 있었으나, ADR-0004의 import 방침이 그 line을 넘어 통과됐다.

본 ADR은 ADR-0004의 wire format 결정은 유지하되, **dependency clause만 amend**한다.

## Decision

### Schema 소유

세션 schema는 Agentchan 소유다. 현재 shape는 Pi `SessionEntry` v3의 snapshot이며,
version namespace는 Agentchan이 단독 운영한다. `version: 3`은 Pi v3과 일치하지만,
Pi가 v4로 가도 자동으로 따라가지 않는다.

Pi의 SessionEntry union의 모든 variant(`message`, `compaction`, `session_info`,
`custom_message`, `model_change`, `label`, `thinking_level_change`, `branch_summary`,
`custom`)와 `buildSessionContext`의 처리 로직을 보존한다. 일부 variant는 현재
agentchan이 발행하지 않지만, Pi가 검증한 의미 모델(path traversal, compaction의
`firstKeptEntryId` 기반 cut, custom message replay 등)을 미래 사용 시점까지
살려둔다.

### Wire format

JSONL wire format은 Pi v3과 호환된다. ADR-0004의 wire format 결정(header
`type: "session"` + entry union + branch는 leafId chain derive)은 본 ADR이
변경하지 않는다. Pi가 우리 jsonl을 read/write하는 경로는 없으므로 "호환"은
Agentchan ↔ Agentchan 자기 호환만 의미한다.

### Sync 정책

Pi 변화 추적은 *cherry-pick*이다. Pi release를 자동으로 따라가지 않는다.
Pi가 schema/semantic을 바꿔도 (a) 그 변화가 Agentchan에 의미 있고 (b)
적용 비용이 가치를 넘지 않을 때만 vendored 코드에 반영한다. *Pi의 코드 구조가
아니라 Pi의 interface와 learning이 sync 단위다.*

### Migration scope

Agentchan은 v3만 발행하고 v3만 수용한다. Pi의 v1→v2, v2→v3 migration helper는
vendor scope 외다 — agentchan이 v1/v2를 발행한 적이 없다 (ADR-0004가 이전 자체
포맷도 호환 reader 없이 드롭한 결정과 같은 결).

## Consequences

- `@mariozechner/pi-coding-agent` dep과 그 transitive(pi-tui, photon-node,
  extract-zip 등)가 그래프에서 사라진다. CLAUDE.local.md의 dep boundary가 사실이
  된다.
- pi-agent-core의 `CustomAgentMessages` 확장은 Pi 대신 Agentchan 자체 module에서
  declaration merging으로 한다. type-level 행동은 동일.
- Pi가 SessionEntry를 evolve해도 Agentchan jsonl은 자동 변하지 않는다.
  Pi → Agentchan은 review를 통한 단방향 inflow뿐.

## Reconsider When

- Pi가 우리에게 의미 있는 semantic fix를 release했는데, vendored 코드와 분기되어
  적용 비용이 가치를 넘는다.
- Agentchan이 자체 schema evolution이 필요해진다(새 variant, header 확장).
  이때 자체 v4로 bump.
- Vendored code가 Pi 원본과 의미 있게 분기해 더 이상 "Pi snapshot"이라 부르기
  어려워진다. 이 시점엔 Pi와의 lineage를 끊는 새 결정이 필요.
