# Pi SessionEntry snapshot

Agentchan은 Session 저장 형식을 Pi-compatible `SessionEntry` JSONL로 유지하되, `@mariozechner/pi-coding-agent`를 runtime dependency로 import하지 않는다. Session schema와 helper는 `packages/creative-agent/src/session/` 안에 Pi 0.70.2 기준 snapshot으로 둔다. Pi 변경은 자동 추종이 아니라 필요한 semantic fix만 cherry-pick한다.

Vendored 범위는 `SessionEntry` union, JSONL parse, branch/context build, compaction replay처럼 ADR-0004의 저장 포맷을 읽고 LLM history로 바꾸는 데 필요한 코드다. Agentchan은 Pi의 v1→v2, v2→v3 migration helper를 vendor하지 않는다. Agentchan은 Pi v3-compatible 파일만 발행하고 읽는다.

Motivation: `pi-coding-agent`는 standalone CLI application이다. Agentchan packaged executable에서 Pi module을 import하면 Pi의 top-level initialization이 library 사용 맥락으로 들어오고, Pi 내부 파일 배치나 binary 가정이 Agentchan 실행을 깨뜨릴 수 있다. 필요한 것은 Pi application 전체가 아니라 SessionEntry 모델과 helper subset이다.

## Considered Options

- **`@mariozechner/pi-coding-agent` 직접 import**: 기각. Pi application의 top-level side effect와 transitive dependency가 Agentchan packaged executable에 들어온다.
- **Pi를 library-friendly fork로 유지**: 기각. Agentchan이 쓰는 범위는 Session schema/helper subset이라 fork 유지 범위가 과대하다.
- **Agentchan 전용 Session schema를 새로 정의**: 기각. ADR-0004에서 선택한 Pi-compatible JSONL 형식과 `buildSessionContext` 의미 모델을 잃는다.

## Consequences

- `@mariozechner/pi-coding-agent`는 production dependency가 아니라 parity test의 비교 대상이다.
- Vendored files에는 원본 버전과 cherry-pick sync 정책을 주석으로 남긴다.
- Pi가 `SessionEntry` 의미를 바꿔도 Agentchan 파일 포맷은 자동으로 바뀌지 않는다.
- `buildSessionContext`는 Pi와의 parity test로 drift를 감지한다. 실패하면 upstream 변경을 cherry-pick할지, Agentchan 쪽 결정을 갱신할지 검토한다.
