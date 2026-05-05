# Session usage

Session usage는 현재 Session 파일에 저장된 모든 assistant Session entry의 `usage` 합이다. 활성 Branch가 무엇인지는 Session usage 계산에 영향을 주지 않는다.

Session usage는 `input`, `output`, `cacheRead`, `cacheWrite`, `cost.total`을 assistant entry 단위로 더해 만든다. User entry, tool result entry, `usage`가 없는 assistant entry는 0으로 본다. Context usage는 별도 값이다. Context usage는 활성 Branch의 마지막 assistant entry에서 다음 LLM 호출의 context 크기를 추정한다.

Motivation: User가 Session usage를 볼 때 기대하는 값은 "현재 보고 있는 Branch의 누적"보다 "이 Session에서 이미 발생한 LLM 사용량"에 가깝다. Branch를 바꿀 때마다 Session usage가 줄어들면 이미 발생한 비용이 사라진 것처럼 보인다.

## Consequences

- `CompactionEntry`에는 현재 `usage` field가 없어 Compaction LLM 호출은 Session usage에서 누락된다. 이 gap이 있는 동안 Session usage를 Provider 청구액과 같다고 단정하지 않는다.
