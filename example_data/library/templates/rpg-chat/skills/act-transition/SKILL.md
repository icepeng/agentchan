---
name: act-transition
description: "현재 막에서 다음 막으로 전환 가능한지 campaign.yaml 의 act_gates 조건식을 평가. 매 씬 말미·주요 비트 후 호출."
---

# act-transition

3막 구조의 막 간 전환 조건 평가. **OPEN** 이면 서술적 전환 가능, **CLOSED** 이면 씬 계속.

## 사용법

```
script(file: "skills/act-transition/scripts/check-gate.ts")
```

인자 없음. 스크립트가 현재 상태(flags·choices·trust·evidence)를 종합 평가. 파일은 수정하지 않음 — 전환 실행 여부는 에이전트의 서사적 판단.

## 언제 호출

- 매 씬 말미 (해당 씬이 주요 단서·대화·전투를 담았을 때)
- 주요 비트 발화 후 (`first_clue`, `faction_reveal`, `confrontation` 등)
- **모든 턴에서 호출하지 말 것** — 평가 비용이 있다. 의미 있는 상태 변화가 있을 때만

## 출력 JSON

stdout 마지막 줄 한 줄 JSON.

### 게이트 CLOSED 예시

```json
{
  "changed": [],
  "deltas": {
    "act": 1,
    "gate": "to_act2",
    "open": false,
    "condition": "clues_found>=3 AND trust:riwu>=+1",
    "atoms": [
      {"atom": "clues_found>=3", "value": false, "explain": "clues_found(0)>=3"},
      {"atom": "trust:riwu>=+1", "value": false, "explain": "trust:riwu(0)>=+1"}
    ],
    "required_beats": ["arrive_dock", "missing_child_rumor", "first_clue"],
    "failed": ["clues_found>=3", "trust:riwu>=+1"]
  },
  "summary": "to_act2 CLOSED — 남은 조건: clues_found>=3, trust:riwu>=+1"
}
```

### 게이트 OPEN 예시

```json
{
  "changed": [],
  "deltas": {
    "act": 1,
    "gate": "to_act2",
    "open": true,
    "condition": "clues_found>=3 AND trust:riwu>=+1",
    "atoms": [...],
    "narrative_cue": "첫 단서들이 그림의 윤곽을 그리고...",
    "next_act": 2
  },
  "summary": "to_act2 OPEN — 전환 가능. LLM 이 world-state.yaml 의 act 를 2 로 갱신하고 전환 씬 작성."
}
```

## 워크플로우

1. 호출 → JSON 확인
2. **CLOSED** → 씬 진행 계속. `failed` / `required_beats` 를 참고해 다음 씬 방향 설정 (특정 NPC 와 대화·증거 확보). 플레이어에게는 **자연어로** 암시 ("중요한 무언가가 아직 드러나지 않았다").
3. **OPEN** → 자연스러운 전환 씬 작성:
   - `narrative_cue` 를 **그대로 인용하지 말고** 2~5줄 내레이션의 뼈대로 사용
   - `world-state.yaml` 의 `act` / `current_scene` 필드를 `write` 또는 `edit` 도구로 `next_act` 값으로 갱신
   - 새 막의 premise 를 씬 분위기로 반영 (Act 2: 세력 구도 노출 / Act 3: 심판·압박)
4. 최종 막(act=3) 에서는 gate 없음 — `ending-check` 로 엔딩 조사 권장

## 금지

- **CLOSED 상태에서 강제 전환** — `open: false` 를 무시하고 act 증가 금지
- **플레이어 "Act 2 가자" 요구에 자동 전환** — 조건 미충족이면 서술적으로 거절
- **조건식 직접 계산** — 항상 스크립트에 위임

## DSL 참조 (campaign.yaml)

조건식 atom:
- `trust:<npc_slug><op><N>` — op: `>=`, `<=`, `>`, `<`, `==`
- `flag:<name>` — `campaign.flags` 배열에 존재
- `evidence:<slug>` — `inventory.yaml evidence` 배열에 존재
- `choice:<slug>=<bool>` — `campaign.choices` 에 저장된 선택
- `clues_found<op><N>` — `evidence` 배열 길이

연결자: `AND`, `OR`, `NOT`, 괄호 `()`
