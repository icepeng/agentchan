# 풀 턴 예시 모음

SYSTEM.md `<references>`가 이 문서를 가리킨다. 아래는 턴별 **스크립트 호출 순서와 씬 구성 요소** 요약. 실제 감각 디테일·분량은 SYSTEM.md 원칙에 따라 작성.

모든 예시의 scene.md append는 유저 메시지 에코 `> ...`로 시작하며, 수치·상태 블록은 씬에 쓰지 않는다 — HUD 는 `world-state.yaml` + `party.yaml` 을 직접 읽어 렌더된다.

---

## 예시 1 — 탐문 + 이동 + 관계 변화

상황: Act 1 중반. 부두→양조장 이동 후 에스텔에게 고아 소문을 묻는다.

스크립트 호출 순서:
1. `scripts/travel.ts --to brewery`
2. `scripts/relationship.ts --npc estelle --event shared_concern --delta +1`

씬 구성:
- 유저 에코 (`> ...`)
- 이동 감각 서술 (출발지 → 도착지 분위기 전환)
- 이탤릭 요약: `*[SUMMARY] pier → brewery, 12분 소요. 11:36 → 11:48.*`
- NPC 도입 서술 + 첫 말붙임 대사
- 질문 제시 → NPC 반응 대사 (핵심 단서)
- 말미 한 줄: `[STAT] estelle +1 (shared_concern) rising`

`next-choices.yaml`: charisma DC 14 / 재질문 / agility DC 12 — 3지선다.

---

## 예시 2 — 전투 한 라운드

상황: Act 2. 암시장 경비 2명 조우. 리우 선공, PC 피격. 첫 라운드 = `--start`.

스크립트 호출 순서:
1. `scripts/combat.ts --actor riwu --category attack --target-dc 12 --round 1 --start`
2. `scripts/combat.ts --actor pc --take-damage 4` (경비 반격 서술 후)

씬 구성:
- 유저 에코
- 환경 감각 서술 (지하 통로의 습기 등)
- `<beat type="combat" round="1"><roll>riwu attacks: d20+3=17 vs 12 → HIT. dmg 5.</roll></beat>`
- 적1 쓰러짐 + 적2 반격 도입 서술
- `<beat type="combat" round="1"><roll>pc takes 4 damage. HP 20 → 16.</roll></beat>`
- PC 피해 감각 서술

`next-choices.yaml`: strength DC 12 반격 / agility DC 10 후퇴 / charisma DC 15 항복 연기.

---

## 예시 3 — Act 2 게이트 열림

상황: 상인 길드와 암시장 연결 확인. `act-transition` 스킬이 Act 1 → Act 2 OPEN 판정.

씬 구성:
- 유저 에코 (단서 연결 발언)
- 증거 대조 서술 (두 문서, 동료가 지점 짚기)
- 동료 확정 대사 ("…같은 밤, 같은 장소. 우연이 아니야.")
- 긴 침묵 + 전환 분위기 묘사 (새벽빛 등)
- 말미: `*[ACT TRANSITION: 1 → 2. 세력 구도가 드러났다. 이제 표면 아래가 보인다.]*`

`next-choices.yaml`: 길드 본부행 / 다스렌 저택 조사 / 동료와 상의.

---

## 예시 4 — Act 3 엔딩 분기 유도

상황: Act 3 말미. `ending-check`가 `hand_over_culprit` OPEN. 카엘렌 인도 결정.

씬 구성:
- 유저 에코 (처분 선언)
- 집행자 등장 서술 (Harbor Watch 마샬, 용의자 결박 상태)
- 용의자 마지막 대사 (마지막 부탁)
- PC 무응답 + 묵계 끄덕임
- 떠나는 발소리·문 닫힘 서술
- 동료의 말 없는 시선
- 말미: `[quest:vanishings complete]`

에이전트는 이 턴 **직후** 엔딩 씬으로 전환 (SYSTEM.md `<endings>` — `---` 구분선 + tone 본문 + 에필로그 + 재시작 안내).
