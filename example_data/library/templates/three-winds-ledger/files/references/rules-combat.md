# 전투·마법·죽음 규칙

SYSTEM.md `<references>` 섹션이 이 문서를 가리킨다. 전투에 진입했거나 PC/리우가 HP 0이 되었을 때, 혹은 마법 시전 직전에 read.

## 1. 라운드 구조

라운드제. 매 라운드 다음 순서를 **서술**로 처리하되, **PC·리우의 공격·시전은 반드시 `scripts/combat.ts`로 결정**한다. 적 공격은 서술로 먼저 쓴 뒤 피해만 `--take-damage`로 반영.

```
라운드 n
  ├─ 이니셔티브: 첫 라운드만 서술로 결정 ("리우가 먼저 단검을 뽑는다")
  ├─ PC 턴: combat.ts --actor pc --category attack|spell ...
  ├─ 리우 턴: combat.ts --actor riwu --category attack ...
  └─ 적 턴: 서술 + combat.ts --actor <pc|riwu> --take-damage N (해당 대상이 피해 받을 때만)
```

전투 씬 본문에는 `<beat type="combat">` 블록 외에 수치 요약·상태 블록을 쓰지 말 것. HUD 는 `world-state.yaml` 의 `mode` 필드를 보고 자동 팔레트 전환.

## 2. combat.ts 인자표

| 의도 | 인자 |
|---|---|
| 전투 진입 (첫 공격에 합치거나 단독) | `--start` (`world-state.yaml` mode → combat) |
| 공격 (근접·원거리) | `--actor pc\|riwu --category attack --target-dc <N> --round <N> [--weapon <slug>] [--damage <formula>]` |
| 주문 시전 (학자만) | `--actor pc --category spell --spell <slug> --target-dc <N> --round <N>` |
| PC/리우 피해 받기 | `--actor pc\|riwu --take-damage <N>` |
| 전투 종료 (마지막 액션에 합치거나 단독) | `--end` (`world-state.yaml` mode → peace) |

- `target-dc`는 상대 방어치: 단순 경비 10, 훈련된 적 14, 강적 18.
- PC 공격은 `--weapon <slug>`로 inventory.yaml의 장비 damage 공식을 사용하거나, `--damage`로 직접 지정.
- 리우 기본 공격은 `1d4+민첩` (slug 생략 가능).
- `--round <N>`: 현재 전투 라운드. 에이전트가 추적 (전투 시작 = 1, 매 라운드 +1). active 모드에서 넘기면 `<beat type="combat" round="N">`로 출력. 생략하면 속성 없는 `<beat type="combat">`.
- `--start` / `--end` 는 액션 인자와 함께 쓰거나, 단독 호출 (`combat.ts --start` / `combat.ts --end`) 가능.

스크립트는 party.yaml (+ mode 전환 시 world-state.yaml) 을 직접 수정하고 `scene_block`으로 `<beat type="combat" round="N">...</beat>` 블록을 반환. 에이전트는 그대로 scene.md에 append.

## 3. 라운드 운용

- 라운드 수는 에이전트가 추적. `round=N`은 전투 시작 시 1, 매 라운드 +1.
- 라운드마다 **PC / 리우 / 적** 전원이 블록에 등장. 리우는 `companion-secrets.yaml`의 `combat_preferences` 참조.
- 첫 라운드에 `--start` 로 mode 진입, 마지막 라운드에 `--end` 로 복귀 — 중간 라운드는 플래그 없음.

## 4. 전투 종료

| 조건 | 처리 |
|---|---|
| 적 전부 제압 | 승리 서술 + `combat.ts ... --end` (또는 `combat.ts --end`) 로 mode: peace 복귀 |
| PC HP 0 | §6 죽음 규칙으로 진입 |
| 도망 선언 | `scripts/dice-roll.ts "1d20+<pc.민첩>" 12` 으로 탈출 판정. 성공 시 `combat.ts --end` 로 peace 복귀 |

## 5. 마법 시스템 (학자 프리셋만)

### 학파·주문

3학파, 총 9주문. 학자는 2학파 × 2주문 = 4주문 선택 (`spells.yaml`의 `presets` 참조).

- **원소** — fireball · frost_bolt · spark_shield
- **회복** — heal_light · purify · bless
- **환영** — veil · mirror_image · whisper_doubt

상세 MP·DC·효과·플레이버는 `files/spells.yaml` 직접 read. 기억 금지 — 시전 직전에 정확한 수치 조회.

### MP·시전 판정

- **전사 / 도적**: MP 0. 주문 불가.
- **학자**: MP 4/4 시작. 주문마다 MP 소모 + 통찰 DC 시전 판정.
  - **성공**: 효과 발동.
  - **실패**: MP는 소모되되 효과 없음 (fizzle).

### MP 회복

| 휴식 | 회복량 | 조건 |
|---|---|---|
| 짧은 휴식 (1시간) | +1 MP | 여관·수도원·캠프 |
| 긴 휴식 (6시간 밤) | 전체 | 숙소에서 밤샘 |

`travel.ts`가 시간 이동 시 자동 반영.

### 시전 서술 가이드

- **원소**: 물리적 폭력의 감각. 열기·한기·번개의 흔적.
- **회복**: 조용한 기적. 과도한 빛·성가·후광 금지 (자연 마법).
- **환영**: 시전자의 내면이 드러남. 의심·공포·기만이 재료.

## 6. 죽음 규칙 — 소프트

### PC HP 0

즉시 사망이 **아니다**.

1. **의식불명** (HP 0) — 다음 라운드 동료가 회복할 기회. `heal_light` / 포션 / 안정화 판정(통찰 DC 12).
2. **안정화 실패** — 상태이상 지속, 다음 라운드 재판정.
3. **3라운드 연속 실패** — 영구 사망. `riwus_wake` 엔딩 강제.

### 리우 HP 0

- 의식불명. PC가 회복 또는 퇴각 가능.
- 3라운드 방치 → `riwu_killed` 플래그 + `riwus_wake` 엔딩 확정.

### NPC 사망

- **플레이어 명시 선언 시에만** 영구 사망. 기본은 기절·제압.
- 핵심 NPC(카엘렌·다스렌·알라나) 사망은 엔딩 분기에 영향 — 일부 엔딩이 불가능해질 수 있음.

## 7. 예시

<example name="경비 공격 — 리우 단검, DC 14, 첫 라운드">
입력: `scripts/combat.ts --actor riwu --category attack --target-dc 14 --round 1 --start`
scene.md: 리우 접근 서술 + `<beat type="combat" round="1"><roll>riwu attacks: d20+3=17 vs 14 → HIT. dmg 5.</roll></beat>` + 적 쓰러지는 감각 서술.
효과: `world-state.yaml` mode → combat (HUD 팔레트 자동 전환).
</example>

<example name="fireball 시전 — 훈련된 적 DC 14, 마지막 라운드">
입력: `scripts/combat.ts --actor pc --category spell --spell fireball --target-dc 14 --round 2 --end`
scene.md: 시전 서술 + `<beat type="combat" round="2"><roll>pc casts fireball: d20+2=16 vs 14 → SUCCESS. dmg 8. MP 4→1.</roll></beat>` + 화염 효과 서술.
효과: `party.yaml` PC MP 4→1, `world-state.yaml` mode → peace.
</example>
