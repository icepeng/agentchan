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

<why>
trust가 한 씬에서 크게 널뛰면 NPC의 개성이 무너진다. 작은 진전을 쌓아 Act 2·3에서
결정적 증거 한 번으로 +2가 나올 때 극적 무게가 생긴다. 쿨다운은 플레이어가
"공감 반응"을 스팸하는 최적화 루프를 막는다.
</why>

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

- 한 줄 1개. 씬 block의 **끝 직전** (`<status>` 앞).
- **`relationship.ts`가 반환한 `scene_block` 그대로 복사** — 형식 편집 금지.

## 5. 예시

<example name="리우에게 공감 반응 — 작은 진전">
플레이어: "그래서, 너도 거리에 있었다고 했지. 몇 살 때였어?"

의도 파악: 리우의 시그니처 주제(과거 동료) 접근 → **작은 진전 (6)**.

입력: `scripts/relationship.ts --npc riwu --event asked_about_past --delta +1`

scene.md append:
```
**리우:** *옷깃을 만지작거린다.* "…일곱. 아니, 여덟이었나. 상관없지."

*대답이 너무 빠르다. 리우는 당신의 시선을 피한다 — 무엇을 숨기려는 건지도 모르면서.*

[STAT] riwu +1 (asked_about_past) rising

<status>
hp: 20/20
mp: 0/0
location: inn
time: 21:30
day: 2
mode: peace
conditions: []
</status>
```
</example>

<example name="카엘렌의 거짓말 깨기 — 거짓말 드러남">
플레이어: "장부 단편엔 자네 이름이 있었어. 부두에 없었다면서."

의도 파악: 이전 씬에서 얻은 `ledger_fragment` 증거로 카엘렌의 알리바이 붕괴 → **거짓말 드러남 (5)**.

입력: `scripts/relationship.ts --npc kaelen --event ledger_confrontation --delta -2`

scene.md append:
```
*카엘렌의 손가락이 탁자 위에서 멈춘다. 아주 잠깐.*

**카엘렌:** "…그건 설명할 수 있어."

[STAT] kaelen -2 (ledger_confrontation) falling

<status>
hp: 18/20
mp: 2/4
location: brass_guild_hall
time: 15:40
day: 4
mode: peace
conditions: []
</status>
```
</example>

<example name="쿨다운 적중 — 아무 변화 없음">
플레이어: (리우에게 또 한 번 과거 질문)

입력: `scripts/relationship.ts --npc riwu --event asked_about_past --delta +1`

스크립트 반환: `{"changed":[],"deltas":{},"summary":"쿨다운 적용..."}`

→ 에이전트는 **`[STAT]` 마커를 찍지 않는다**. 대신 리우가 조용히 대화 주제를 튼다거나, 플레이어가 "이 NPC는 같은 질문에 더 열리지 않는다"는 신호를 서술로 받도록 한다.
</example>
