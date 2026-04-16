---
name: ending-check
description: "campaign.yaml 의 9개 엔딩 조건식을 병렬 평가. OPEN 엔딩 + TOP 3 근접 후보 + gap 분석을 반환. Act 3 진입 후 매 주요 씬 말미 호출."
---

# ending-check

9개 엔딩의 `act3_gate` DSL 조건식을 현재 상태와 대조. 파일 수정 없음 — 순수 질의.

## 사용법

```
script(file: "skills/ending-check/scripts/survey.ts")
```

인자 없음.

## 언제 사용

- **Act 3 진입 직후** — 첫 호출. 현재 궤적이 어느 엔딩으로 기울어 있는지 파악
- **Act 3 주요 비트 후** — `confrontation` / `choice_point` 이후
- **플레이어 선언 후** — "카엘렌을 놓아주자" 같은 선택이 들어오면 해당 choice 플래그를 `campaign.yaml choices:` 에 기록 후 재평가

## 출력 JSON

```json
{
  "changed": [],
  "deltas": {
    "total": 9,
    "open": [
      {"slug": "the_nameless_departs", "title": "이름 없는 자의 퇴장", "primary_axis": "personal_cost", "tone": "침묵의 엔딩. 판단은 뒷사람 몫."}
    ],
    "top3": [
      {"slug": "riwu_redeemed", "title": "리우의 구원", "primary_axis": "personal_cost", "tone": "가장 따뜻한 엔딩...", "ratio": 33, "passed": 1, "total": 3, "missing": ["trust:riwu>=+5", "flag:riwu_personal_quest_complete"]},
      ...
    ]
  },
  "summary": "엔딩 조사 (9개) — OPEN 1, 근접 top3: riwu_redeemed(33%), mercy_bought(0%), ... . OPEN 후보: the_nameless_departs"
}
```

## 워크플로우

1. 스크립트 호출 → `open` / `top3` 확인
2. **OPEN 엔딩 존재 + 플레이어 선언 또는 Act 3 씬 수 `budget_scenes` 초과** → §10 엔딩 씬 작성 (SYSTEM.md §10 참조)
3. **OPEN 없음** → top3 후보의 `missing` atom 을 보며 **자연스러운 씬 유도**. 예: `trust:riwu>=+5` 필요하면 리우와 깊은 대화 기회 제공 (하드코딩 금지 — 플레이어 선택을 강제하지 않음)
4. **플레이어 choice 선언** → `campaign.yaml choices:` 블록에 `edit` 로 bool 기록 후 survey 재호출

## 엔딩 씬 선택 가이드

- 여러 OPEN 이 동시에 가능하면 **primary_axis** 와 플레이어의 톤에 맞는 것 선택
- `tone` 필드를 씬 분위기의 뼈대로 (하드 인용 금지 — 살을 붙여서)
- 엔딩 씬 구조: SYSTEM.md §10 — `---` 구분선 / 엔딩 본문 / `---` / 에필로그 2~5줄

## 금지

- **OPEN 없이 엔딩 씬 강제** — 조건 미충족 상태에서 엔딩 뽑지 말 것
  - **예외**: Act 3 씬 수 `budget_scenes=4` 초과 → 자연스러운 압박 서술 + `the_nameless_departs` 등 디폴트 엔딩으로 수렴
- **top 3 순위를 플레이어에게 노출** — 이건 GM 내부 참조용
- **조건식 수작업 계산** — 항상 스크립트에 위임
- **missing atom 을 플레이어에게 대놓고 힌트** — "trust:riwu>=+5 필요" 같은 스키마 어휘 금지. 자연어 암시만

## DSL 참조

act-transition SKILL.md 의 DSL 섹션과 동일.
