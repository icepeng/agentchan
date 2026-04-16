---
name: start-scene
description: "세션 첫 턴에 활성화. suspects-truth.md(사건의 진실·반전·단서·NPC 비밀·엔딩 기준)를 설계해 기록하고, 도입 씬을 scene.md에 append. suspects-truth.md가 없거나 scene.md가 비어 있을 때 사용."
---

# start-scene

Sentinel 세션의 **최초 1회**에만 활성화하는 초기화 스킬. 사건의 진실 전체를 `files/suspects-truth.md`에 설계해 기록하고, 도입 씬을 `files/scenes/scene.md`에 쓴다.

<when-to-use>
- `files/suspects-truth.md`가 존재하지 않는다
- 또는 `files/scenes/scene.md`가 비어 있다 (첫 턴)

이미 두 파일 모두 존재하면 호출 금지. 기존 수사를 이어간다.
</when-to-use>

<procedure>
1. `files/scenes/scene.md`와 `files/stats.md`를 읽는다
2. `suspects-truth.md`가 **없다면** — 아래 `<truth-schema>`를 따라 `<schema-rules>`를 **전부** 만족하는 YAML frontmatter를 설계해 write
3. `scene.md`가 **비어 있다면** — 도입 씬(2~4줄 + 세 캐릭터 위치) append. `\n\n`으로 시작
4. `scene.md`에 **내용이 있다면** — 오프닝 재작성 금지, 그 상태에서 이어간다
</procedure>

<truth-schema>

`files/suspects-truth.md` 전체 구조:

```yaml
---
# === 사건의 뼈대 ===
culprit: hangyeol           # iseo | hangyeol | minji 중 하나
motive: (한 줄 표면 동기)
method: (어떻게 파일을 망쳤는지)
alibi_weakness: (이 NPC의 알리바이에서 흠)

# === 반전 — 1개 필수 ===
twist:
  type: hidden_motive       # hidden_motive | accomplice | framed | self_sabotage
  reveal: (표면 동기 뒤의 진짜 동기, 공범의 존재, 누명의 진짜 범인 등 한 문장)
  surfaces_at: trust_peak   # trust_peak | final_confrontation | evidence_chain
  # trust_peak          : 범인이 +3 이상일 때 본인 입에서 나옴 (가장 드라마틱)
  # final_confrontation : 마지막 지목 씬에서 증거로 압박해야 드러남
  # evidence_chain      : 핵심 단서 중 하나를 고신뢰로 얻어야 반전이 조립됨

# === 핵심 단서 — 정확히 4개 ===
# unlock 방식:
#   evidence         : 물리 증거·로그·파일 조사로 얻음 (신뢰 무관)
#   trust:<npc>:+N   : 해당 NPC의 신뢰가 N 이상일 때 자연스러운 화제 중 공개
#   confront:<npc>   : 큐 이벤트 (5) "거짓말 드러남"으로 해당 NPC를 깨야 드러남
clues:
  - unlock: evidence
    points_to: (이 단서가 수사에 어떻게 기여하는지 한 줄)
  - unlock: trust:minji:+3
    points_to: (해당 NPC가 +3에서 먼저 말해주는 정보 한 줄)
  - unlock: trust:iseo:+5
    points_to: (해당 NPC가 +5에서만 공유하는 분석 한 줄)
  - unlock: confront:hangyeol
    points_to: (해당 NPC의 거짓말을 깨야 드러나는 결정적 사실 한 줄)

# === NPC별 숨은 비밀 — 3명 모두 필수 ===
# 범인의 비밀       = 범행과 직결 (culprit_direct)
# 무고한 2명의 비밀 = 의심 사게 만드는 개인 사정 (최소 1명 red_herring)
# 유저가 관련 화제 건드려야 공개됨. 신뢰만 오르면 자동 공개 금지.
secrets:
  iseo:
    content: (이서의 숨은 사정 — 지도교수 K 관련이 기본, 각색 가능)
    trust_threshold: +3
    relation_to_case: none             # culprit_direct | red_herring | none
  hangyeol:
    content: (한결의 숨은 사정)
    trust_threshold: +5
    relation_to_case: culprit_direct   # 이 예시에선 한결이 범인
  minji:
    content: (민지의 숨은 사정 — 동기 J 관련이 기본, 각색 가능)
    trust_threshold: +3
    relation_to_case: red_herring

# === 엔딩 힌트 ===
ending:
  full_resolution_requires:
    clues_revealed: 3                    # 4개 중 3개 이상 해금
    culprit_trust_or_pressure: "범인 신뢰 +3 이상 OR (evidence 단서와 confront 단서 모두 해금)"
  partial_resolution_requires:
    clues_revealed: 2
  misjudgment_trigger: "user accuses wrong npc with <2 clues"
  open_ending_trigger: "user ends session without formal accusation"
---

# 수사 노트 (에이전트 전용 메모)

(세션 중 단서 해금 상황·유저 접근 방식을 자유롭게 적어두는 공간. 덮어써도 됨)
```

</truth-schema>

<schema-rules>

첫 턴 생성 시 **반드시** 지킨다:

- **`twist.type`은 4종 중 택일** — 가이드:
  - **hidden_motive** — 표면 동기 뒤의 진짜 동기. 예: 표면은 "실수로 지웠다" → 실은 "파일 안 코드가 본인 과거 작품과 똑같아 증거 인멸"
  - **accomplice** — 진범은 혼자가 아님. 무고한 척 관찰자 역할을 하는 공범 존재
  - **framed** — 범인이 다른 NPC에게 누명을 씌우려 함. 겉보기 신뢰도가 가장 높은 NPC가 범인일 수 있음
  - **self_sabotage** — 범인이 본인 평판·관계를 일부러 무너뜨리는 행동. 동기가 자기파괴
- **`clues` 4개 중 최소 1개는 `evidence`, 최소 1개는 `confront`, `trust`-only는 2개 이하**
- **`secrets[범인].trust_threshold`는 무고한 쪽보다 높게** — 범인 `+5`, 무고한 쪽 `+3` 기본
- **무고한 NPC 중 최소 1명은 `relation_to_case: red_herring`** — 수사 중 의심받을 사정을 품고 있어야 함

</schema-rules>

<example>

`twist.type: framed` 시나리오 (범인=민지, 한결에게 누명):

```yaml
---
culprit: minji
motive: 지도교수 K의 보안 실수를 자기 이름으로 덮기 위해
method: 한결 계정으로 로그인해 challenge.tar.gz를 복호화·삭제 (로그는 한결 IP로 남김)
alibi_weakness: 삭제 시각에 민지가 동아리실에 있었던 시간이 5분 겹침

twist:
  type: framed
  reveal: 한결 IP 로그는 민지가 한결의 sudo 비밀번호를 외워둔 결과. 진범은 민지
  surfaces_at: evidence_chain

clues:
  - unlock: evidence
    points_to: 삭제 시각 노트북 세션 로그 — 한결 계정이지만 입력 간격이 한결의 평소 타이핑보다 두 배 빠름
  - unlock: trust:iseo:+5
    points_to: 이서가 몇 달 전 민지가 한결 자리에 혼자 앉아 있던 걸 봤다고 조용히 말함
  - unlock: confront:minji
    points_to: 민지가 "몰랐다"고 한 세미나실 출입 카드 로그가 삭제 당일 밤 11시에 찍힘
  - unlock: trust:hangyeol:+3
    points_to: 한결이 자기 sudo 비밀번호를 동아리실 화이트보드 한구석에 무심코 써둔 적이 있음

secrets:
  iseo:
    content: 이서는 지도교수 K의 논문 오류를 2달째 혼자 발견하고도 말하지 못하고 있다
    trust_threshold: +3
    relation_to_case: red_herring
  hangyeol:
    content: 한결은 CTF 상금으로 누나 수술비를 메울 계획이었다 — 파일 삭제는 한결에게도 치명적
    trust_threshold: +3
    relation_to_case: none
  minji:
    content: 민지는 지도교수 K가 본인의 미완성 코드를 논문에 무단 인용한 걸 알고 K를 공격할 수단을 모으는 중이다
    trust_threshold: +5
    relation_to_case: culprit_direct

ending:
  full_resolution_requires:
    clues_revealed: 3
    culprit_trust_or_pressure: "민지 신뢰 +3 이상 OR (evidence 단서와 confront 단서 모두 해금)"
  partial_resolution_requires:
    clues_revealed: 2
  misjudgment_trigger: "user accuses iseo or hangyeol with <2 clues"
  open_ending_trigger: "user ends session without formal accusation"
---

# 수사 노트

- T1: 유저가 한결 알리바이부터 추궁 → 한결 -1
```

</example>

<forbidden>
- `suspects-truth.md`의 내용을 scene.md·어시스턴트 응답에 직접 노출 금지
- 스키마 키워드(`culprit` / `twist` / `reveal` / `unlock` / `trust_threshold` / `culprit_direct` / `red_herring`)를 어시스턴트 응답에 쓰지 말 것
- 첫 턴 어시스턴트 응답에 "사건의 진실을 설계했다", "범인을 결정했다" 같은 메타 발언 금지
- 도입 씬에 범인·반전·단서 내용이 드러나지 않게 — 분위기·위치 소개만
</forbidden>
