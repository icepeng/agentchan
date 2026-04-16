---
slug: scholar
preset: scholar
display-name: 학자
attributes:
  strength: -1
  agility: 0
  insight: 2
  charisma: 2
hp: { current: 16, max: 16 }
mp: { current: 4, max: 4 }
equipment:
  weapon: null
  armor: null
  accessory: scholars_tome
start_spells: [fireball, heal_light, veil, bless]
start_items: [quill_ink, crystal_lens]
---

# 프리셋: 학자 (Scholar)

> 어느 왕립 아카데미에서 학파 2개를 이수했다. 왜 이런 변두리 항구에 왔는지는 본인만 안다.

## 스탯

- 힘 -1 · 민첩 0 · **통찰 +2** · **화술 +2**
- **HP 16 / 16** · **MP 4 / 4** (마법 사용 가능)
- **장비**: 마력서 (학파 3개 열람, 시전은 보유 주문만)
- **시작 주문 4개**: fireball · heal_light · veil · bless (균형형)
- **추가 물품**: 깃펜·잉크 · 수정 렌즈

## 플레이 스타일

- **마법 · 대화 특화** — 통찰 · 화술 +2. 관찰·분석·설득·시전 모두 강함
- **약한 몸** — 힘 -1, HP 16. 전투에서 **최후방 · 동료 뒤**
- **MP 관리** — 4 MP 로 주문 2~3개 시전 가능. 회복은 짧은 휴식(1시간 → +1) 또는 숙소 밤샘(전체 회복)
- **시전 판정** — 매 주문 통찰 DC. 실패 시 MP 는 소모 (주문이 흩어짐)

## 배경

어느 왕립 아카데미에서 학파 2개를 이수했다. 왜 학자의 자리를 버리고 이런 변두리 항구에 왔는지는 본인만 안다. 책보다 사람 관찰이 더 재밌어졌다.

## 성격

예의 바르고 질문이 많음. 위기에는 두 번 계산한 뒤 한 번 움직임. 낯선 단어를 들으면 잊기 전에 메모.

## 외형

키는 보통, 어깨가 좁음. 짙은 로브 아래 실크 셔츠. 손가락에 잉크 자국.

## 시작 주문 (균형형)

| 주문 | 학파 | MP | DC | 효과 |
|---|---|---|---|---|
| fireball | 원소 | 3 | 14 | 1d8+통찰 화염 피해 |
| heal_light | 회복 | 2 | 12 | 1d6+통찰 HP 회복 (동료) |
| veil | 환영 | 2 | 13 | 자신 은신 1라운드 |
| bless | 회복 | 3 | 15 | 동료 1명 다음 판정 어드밴티지 |

## 다른 조합 옵션 (`spells.yaml presets`)

- **파괴형**: fireball, frost_bolt, spark_shield, veil — 원소 중심 + 은신
- **지원형**: heal_light, purify, bless, whisper_doubt — 직접 공격 없이 지원

## 전투 조언

- **1라운드** — veil 로 은신 + 2라운드 fireball 기습 (어드밴티지)
- 경비 (DC 13) 는 fireball (5~10 피해) 로 2~3라운드 해결
- 두목 (DC 19) → MP 집중 투입 (bless 는 동료에게, fireball 반복)
- HP 1/3 이하 → 1라운드 후퇴 + 동료가 엄호

## 대표 판정

- 거짓말 간파: 통찰 DC 13 쉬움 (통찰 +2) — **8 NPC의 거짓말 대부분 탐지 가능**
- 고문서·암호 해독: 통찰 DC 15 보통
- 협상·설득: 화술 DC 15 보통 (화술 +2)
- 문 부수기: 힘 DC 14 어려움 (힘 -1)
- 은신: 민첩 DC 14 보통 (민첩 0)
