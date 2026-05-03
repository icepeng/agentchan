---
name: start-scene
description: "세션 첫 턴에 활성화. 결혼식 살인 사건의 진실 파일을 설계하고, 유저가 의심받는 오프닝 씬과 첫 선택지를 scene.md에 append."
---

# start-scene

Last Vow 세션의 **최초 1회**에만 활성화한다. 사건의 진실 전체를 `files/suspects-truth.md`에 설계해 기록하고, 유저가 피의자로 몰리는 도입 씬을 `files/scenes/scene.md`에 쓴다.

<when-to-use>
- `files/suspects-truth.md`가 존재하지 않는다
- 또는 `files/scenes/scene.md`가 비어 있다
</when-to-use>

<procedure>
1. 시작 자료를 모두 read한다: `files/scenes/scene.md`, `files/stats.md`, `files/personas/*.md`, `files/characters/*/*.md`. 목록이 필요하면 `files/personas`와 `files/characters`를 tree로 확인한 뒤, 발견한 read들을 한 응답에서 병렬 호출한다. tree와 read를 같은 응답에 섞지 않는다
2. `suspects-truth.md`가 없다면 아래 `<truth-schema>`와 `<schema-rules>`를 만족하는 YAML frontmatter를 설계해 write
3. `scene.md`가 비어 있다면 도입 씬을 append한다
   - 2와 3이 모두 필요하면 대상 파일이 다르므로 같은 응답에서 호출한다
4. 도입 씬 마지막에 `[CHOICES]` 3개를 둔다
5. `scene.md`에 내용이 있다면 오프닝 재작성 금지. 그 상태에서 이어간다
</procedure>

<truth-schema>

`files/suspects-truth.md` 전체 구조:

```yaml
---
# === 사건의 뼈대 ===
culprit: hangyeol                 # iseo | hangyeol | minji 중 하나
surface_motive: (한 줄 표면 동기)
true_motive: (유저에게 혐의를 씌운 진짜 이유)
method: (유라에게 독/약물을 어떻게 전달했는지)
frame_method: (왜 유저가 마지막 목격자처럼 보이는지)
alibi_weakness: (범인의 알리바이 흠)

# === 반전 — 1개 필수 ===
twist:
  type: hidden_relationship       # hidden_relationship | debt | revenge | family_coverup
  reveal: (사랑, 돈, 가족, 복수 중 하나로 설명되는 반전 한 문장)
  surfaces_at: trust_peak         # trust_peak | final_confrontation | evidence_chain

# === 핵심 단서 — 정확히 5개 ===
# unlock 방식:
#   evidence           : 물리 증거·기록 조사로 얻음
#   trust:<npc>:+N     : 해당 NPC 협조가 N 이상일 때 공개
#   confront:<npc>     : 해당 NPC의 거짓말을 깼을 때 공개
#   pressure:user:-N   : user_suspicion이 N 이하로 내려갔을 때 목격자가 말함
clues:
  - unlock: evidence
    points_to: (잔/드레스/CCTV/출입 기록 등 물리 단서)
  - unlock: evidence
    points_to: (유저에게 불리해 보이지만 뒤집히는 단서)
  - unlock: trust:minji:+3
    points_to: (민지가 숨기던 타임라인)
  - unlock: confront:hangyeol
    points_to: (한결의 거짓말이 깨지며 드러나는 사실)
  - unlock: pressure:user:-2
    points_to: (유저 혐의가 약해져야 말하는 하객/직원 목격담)

# === NPC별 숨은 비밀 — 3명 모두 필수 ===
# 범인의 비밀       = 유저에게 혐의를 씌운 이유와 직결 (culprit_direct)
# 무고한 2명의 비밀 = 강한 레드 헤링
secrets:
  iseo:
    content: (이서의 숨은 사정)
    trust_threshold: +3
    relation_to_case: red_herring
  hangyeol:
    content: (한결의 숨은 사정)
    trust_threshold: +5
    relation_to_case: culprit_direct
  minji:
    content: (민지의 숨은 사정)
    trust_threshold: +3
    relation_to_case: none

# === 엔딩 힌트 ===
ending:
  full_resolution_requires:
    clues_revealed: 4
    culprit_trust_or_pressure: "범인 협조 +3 이상 OR (evidence 단서 2개와 confront 단서 해금)"
  partial_resolution_requires:
    clues_revealed: 3
  misjudgment_trigger: "user accuses wrong npc with <3 clues"
  open_ending_trigger: "user ends session without formal accusation"
---

# 수사 노트

(세션 중 단서 공개 상황과 유저 혐의 변화를 적는다)
```

</truth-schema>

<schema-rules>

첫 턴 생성 시 반드시 지킨다:

- 범인은 `iseo | hangyeol | minji` 중 하나
- 반전은 기술 지식 없이 이해되는 인간 동기여야 한다: 숨은 관계, 빚, 복수, 가족 은폐
- 유저에게 혐의가 붙는 이유는 반드시 `frame_method`에 적는다
- `clues`는 정확히 5개. 최소 2개 `evidence`, 최소 1개 `confront`, 최대 2개 `trust`
- `pressure:user:-N` 단서 1개 필수. 유저 혐의를 낮춰야 새 증언이 열리게 한다
- 무고한 NPC 중 최소 1명은 `relation_to_case: red_herring`
- 범인의 비밀은 무고한 쪽보다 높은 임계값(+5 기본)
- 사건은 경찰 과학수사보다 결혼식장 안에서 확인 가능한 물건과 증언으로 풀려야 한다

</schema-rules>

<opening-scene>

도입 씬 필수 요소:

- 첫 줄은 `> 사용자 메시지`
- 첫 장면의 앞 8줄 안에 유저의 관계를 드러낸다: 신부 나유라의 오래된 친구, 한동안 멀어졌고, 식 전날 다퉜으며, 오늘 마지막으로 만난 사람
- 유저는 폐백실 또는 신부대기실 앞에 있고, 직원 또는 하객에게 나가지 못하게 막힌다
- 세 NPC가 같은 공간에 있으며, 모두 유저를 완전히 믿지 않는다
- 세 NPC를 설명문으로 소개하지 말고 즉시 충돌로 소개한다
  - 이서: 시간표·동선·출입 기록으로 유저를 막는다
  - 한결: 유라와의 과거와 전날 말다툼을 들이민다
  - 민지: 유라가 유저를 기다렸다는 사실을 말하면서도 유저를 완전히 믿지 못한다
- 유저에게 불리한 정황 2개를 즉시 보여준다
  - 예: 유저의 손수건에 립스틱, 유저가 든 샴페인 잔, CCTV 사각지대 12분, 유라와의 공개 말다툼
- 유라의 사망 또는 중태를 선정적으로 묘사하지 말고, 쓰러진 뒤 구급차가 떠난 상태로 시작한다
- 첫 선택지는 단순 조사보다 관계와 혐의를 여는 선택지를 우선한다
- 마지막에 첫 선택지 3개

첫 선택지 예시:

```
[CHOICES]
- label: 내가 왜 의심받는지 묻는다 | action: 세 사람 앞에서 내가 왜 의심받는지 정확히 말해달라고 한다
- label: 마지막 대화를 떠올린다 | action: 유라와 마지막으로 나눈 말을 떠올리고, 그 말이 왜 나를 의심스럽게 만드는지 확인한다
- label: 유라와의 관계를 묻는다 | action: 이서, 한결, 민지에게 각자 유라와 어떤 관계였는지 말하게 한다
[/CHOICES]
```

</opening-scene>

<forbidden>
- `suspects-truth.md`의 내용을 scene.md·어시스턴트 응답에 직접 노출 금지
- 첫 턴 어시스턴트 응답에 "범인을 정했다", "진실 파일을 만들었다" 같은 메타 발언 금지
- 오프닝에서 범인·반전·결정적 단서가 드러나지 않게 한다
- 선택지 없이 도입 씬을 끝내지 않는다
</forbidden>
