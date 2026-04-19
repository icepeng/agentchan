# 관계 시스템 — trust 축·큐 이벤트

SYSTEM.md `<references>` 섹션이 이 문서를 가리킨다. 관계 변화를 일으키려는 **직전에만** read.

## 1. 단일 축: trust

비-동료 8명 + 리우(동료) 모두 동일한 **trust 축** (`-5 ~ +5`)을 공유한다. "이 NPC가 플레이어를 어떻게 보는가" — 플레이어의 감정이 아니다.

| 값 | 의미 | NPC 행동 |
|---|---|---|
| **-5** | 적의 | 공격·완강한 거짓말·신고 |
| **-3** | 경계 | 필요한 말만, 날선 대답 |
| **-1 ~ +1** | 중립 | 피상적 협력 |
| **+3** | 협력 | 자발적 정보 공유, 개인 단서 |
| **+5** | 동맹 | 약점·진실·숨겨진 동기까지 공유 |

### approval 방향

각 trust 값에 최근 변화 방향(`rising` / `falling` / `steady`)이 붙는다. 렌더러가 우측 관계 탭에 ↗·↘·→로 표시. `[STAT]` 마커의 네 번째 필드 = 방향.

## 2. 큐 이벤트 — 변화 발생 조건

**매 턴 변화를 주지 말 것.** 다음 6가지에서만 trust가 움직인다:

| # | 이벤트 | 변화량 | 설명 |
|---|---|---|---|
| 1 | 배신·구조 | ±2~3 | 플레이어가 NPC를 위험에서 구하거나 명백히 배신 |
| 2 | 결정적 증거 | ±1~2 | 반박 불가능한 증거 제시 |
| 3 | 경계 돌파 대화 | ±1~2 | NPC의 약한 고리(과거·관계·비밀)에 정확히 접근 |
| 4 | 공개 지목·변호 | ±1~2 | 다른 NPC 앞에서 이 인물을 지목하거나 옹호 |
| 5 | 거짓말 드러남 | ±2 (대개 −) | 이 NPC의 거짓을 다른 증거로 깸 |
| 6 | 작은 진전 | +1 전용 | 시그니처 동작·관심사에 정확한 반응, 공감 |

### 규칙

- (6) 작은 진전: **항상 +1**, 같은 NPC에 **3씬 쿨다운** (relationship.ts가 자동 체크)
- (2)(3)(4) 중간급: 기본 ±1, 극적이면 ±2
- (1)(5) 큰 이벤트: 기본 ±2, 씬 뒤집는 순간만 ±3
- **±4 이상 금지** — 스크립트가 거부함 (`Math.abs(delta) > 3` 에러)

## 3. 스크립트 호출

```bash
scripts/relationship.ts --npc <slug> --event <trigger_slug> --delta <+N|-N>

# 플롯 결정적 순간 — 쿨다운 무시
scripts/relationship.ts --npc <slug> --event <trigger_slug> --delta <+N|-N> --skip-cooldown
```

- `--delta`는 `+1`/`-2` 같은 부호 있는 정수.
- 스크립트가 쿨다운(같은 NPC·같은 이벤트 3씬 내 금지)을 체크.
- 쿨다운 적중 시 `changed: []`, `deltas: {}`, summary에 "쿨다운 적용" 반환 → 에이전트는 `[STAT]` 마커를 **찍지 않는다**.
- 성공 시 `[STAT] <npc> ±N (<event>) <direction>` 인라인 마커 반환. scene.md에 그대로 복사.

## 4. 인라인 마커 형식

```
[STAT] riwu +1 (helps_vulnerable) rising
[STAT] kaelen -2 (defends_kaelen_refused) falling
```

- 한 줄 1개. 씬 block 의 끝에 배치.
- **`relationship.ts`가 반환한 `scene_block` 그대로 복사** — 형식 편집 금지.

## 5. 예시

<example name="리우에게 공감 반응 — 작은 진전">
상황: "너도 거리에 있었다고 했지. 몇 살 때였어?" — 리우의 시그니처 주제(과거) 접근 → **작은 진전 (6)**.
입력: `scripts/relationship.ts --npc riwu --event asked_about_past --delta +1`
scene.md: 리우의 회피성 응답 대사 + 시선 피하는 내레이션 → 말미 `[STAT] riwu +1 (asked_about_past) rising`.
</example>

<example name="카엘렌 거짓말 깨기 — 거짓말 드러남">
상황: 이전 씬의 `ledger_fragment` 증거로 알리바이 붕괴 → **거짓말 드러남 (5)**.
입력: `scripts/relationship.ts --npc kaelen --event ledger_confrontation --delta -2`
scene.md: 카엘렌 손가락 멈칫 + 해명 시도 대사 → `[STAT] kaelen -2 (ledger_confrontation) falling`.
</example>

<example name="쿨다운 적중 — 아무 변화 없음">
상황: 리우에게 같은 과거 질문 반복.
입력: `scripts/relationship.ts --npc riwu --event asked_about_past --delta +1`
반환: `{"changed":[],"deltas":{},"summary":"쿨다운 적용..."}` → **`[STAT]` 마커 찍지 말 것**. 대신 리우가 조용히 주제 돌리거나, "이 NPC는 더 열리지 않는다"는 신호를 서술로 처리.
</example>
