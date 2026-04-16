# 풀 턴 예시 모음

SYSTEM.md `<references>`가 이 문서를 가리킨다. 아래는 **한 턴 전체가 어떻게 생겼는가**의 실물 샘플. 마커 순서·감각 디테일 밀도·분량 감각을 이 예시들에서 맞춰라.

모든 예시는 `scene.md`에 append되는 정확한 텍스트다. 유저 메시지 에코 `> ...`로 시작하고 `<status>` 블록으로 끝난다.

---

## 예시 1 — 탐문 씬 + 이동 + 관계 변화

상황: Act 1 중반. 부두에서 양조장으로 이동. 양조장 주인 에스텔에게 고아 소문을 묻는다.

스크립트 호출 순서:
1. `scripts/travel.ts --to brewery`
2. `scripts/relationship.ts --npc estelle --event shared_concern --delta +1`

```
> 양조장으로 가서 에스텔 할머니에게 아이들 얘기를 묻는다.

*부두의 비린내가 뒤로 물러난다. 좁은 골목을 따라 올라가면 양조장 굴뚝의 연기가 먼저 보인다. 나무 계단이 발밑에서 삐걱인다.*

*[SUMMARY] pier → brewery, 12분 소요. 11:36 → 11:48.*

*에스텔은 커다란 나무 주걱으로 통 안쪽을 휘젓고 있다. 당신이 문을 밀고 들어서자 고개도 들지 않고 말한다.*

**에스텔:** "거긴 앉지 마. 젖은 행주가 있어."

*당신이 질문을 꺼내자 손이 멈춘다. 잠시 주걱 손잡이에 기대어 숨을 고른다.*

**에스텔:** "…그 아이들. 라라네 집 쌍둥이도 있었지. 열흘 전부터 안 보여."

[STAT] estelle +1 (shared_concern) rising

<status>
hp: 20/20
mp: 0/0
location: brewery
time: 11:48
day: 1
mode: peace
conditions: []
</status>
```

`next-choices.yaml` (overwrite):
```yaml
options:
  - label: "장부를 보여 달라고 한다"
    stat: charisma
    dc: 14
    action: "에스텔에게 양조장 납품 장부를 보여 달라고 한다."
  - label: "누가 그 아이들을 마지막으로 봤는지 묻는다"
    action: "누가 마지막으로 쌍둥이를 봤는지 묻는다."
  - label: "조용히 밖으로 나와 근처를 살핀다"
    stat: agility
    dc: 12
    action: "양조장 밖으로 나와 주변 골목을 은밀히 살핀다."
```

---

## 예시 2 — 전투 한 라운드

상황: Act 2. 암시장 경비 두 명과 조우. 리우가 선공, PC는 방어.

스크립트 호출 순서:
1. `scripts/combat.ts --actor riwu --category attack --target-dc 12`
2. `scripts/combat.ts --actor pc --take-damage 4` (경비의 반격 서술 후)

```
> 리우에게 먼저 치라고 신호하고 나는 문 뒤에 붙는다.

*지하 시장의 좁은 통로는 습기로 번들거린다. 리우가 당신의 눈짓을 본다. 이미 칼날이 손안에 있다.*

<beat type="combat" round="1">
<roll>riwu attacks: d20+3=17 vs 12 → HIT. dmg 5.</roll>
</beat>

*첫 번째 경비가 소리도 내지 못하고 무릎을 꺾는다. 하지만 두 번째 경비가 이미 몽둥이를 들고 당신을 향해 뛰어든다.*

<beat type="combat" round="1">
<roll>pc takes 4 damage. HP 20 → 16.</roll>
</beat>

*어깨에 둔탁한 충격. 바닷물 젖은 나무 냄새가 목구멍까지 찌른다.*

<status>
hp: 16/20
mp: 0/0
location: undermarket
time: 23:47
day: 3
mode: combat
conditions: []
</status>
```

`next-choices.yaml`:
```yaml
options:
  - label: "단검으로 반격한다"
    stat: strength
    dc: 12
    action: "경비의 몽둥이를 쳐내고 단검으로 반격한다."
  - label: "뒤로 물러나 리우와 합류한다"
    stat: agility
    dc: 10
    action: "몸을 낮추고 리우 쪽으로 물러난다."
  - label: "항복하는 척 무기를 떨어뜨린다"
    stat: charisma
    dc: 15
    action: "무기를 내려놓고 대화를 요청한다."
```

---

## 예시 3 — Act 2 게이트 열림 (act-transition 스킬 사용 후)

상황: 플레이어가 상인 길드와 암시장의 연결을 확인. `act-transition` 스킬이 Act 1 → Act 2 게이트를 OPEN으로 판정.

```
> 그래서 길드의 납품 기록이 암시장 지도랑 정확히 겹친다는 거네.

*탁자 위에 두 장의 종이. 한쪽은 Brass Guild의 분기 납품 목록, 다른 한쪽은 암시장의 거래 지점. 리우가 손가락으로 세 점을 짚는다.*

**리우:** "…같은 밤, 같은 장소. 이건 우연이 아니야."

*그 말 뒤에 한동안 아무도 말하지 않는다. 여관 창밖으로 새벽빛이 들어오기 시작한다. 도시가 조금씩 다른 얼굴을 드러낸다.*

*[ACT TRANSITION: 1 → 2. 세력 구도가 드러났다. 이제 표면 아래가 보인다.]*

<status>
hp: 18/20
mp: 2/4
location: inn
time: 05:12
day: 4
mode: peace
conditions: []
</status>
```

`next-choices.yaml`:
```yaml
options:
  - label: "길드 본부로 간다"
    action: "Brass Guild 본부로 카엘렌을 만나러 간다."
  - label: "다스렌 저택을 조사한다"
    action: "다스렌 가문 저택 주변을 살피러 간다."
  - label: "리우와 다음 걸음을 상의한다"
    action: "리우와 함께 이후 계획을 상의한다."
```

---

## 예시 4 — Act 3 엔딩 분기 유도 (ending-check 스킬 사용 후)

상황: Act 3 말미. `ending-check`가 OPEN 후보로 `hand_over_culprit`을 반환. 플레이어가 카엘렌 처벌을 두고 결정을 앞두고 있다.

```
> …그래서 카엘렌을 위병에게 넘긴다. 단, 길드 전체를 끌어들이진 않는다.

*Harbor Watch의 마샬 그림자가 문간에 서 있다. 카엘렌은 눈을 내리깔고 있다. 손은 이미 묶였다.*

**카엘렌:** "길드 이름은 빼 줘. 부탁할게. 저 친구들 아직 어려."

*당신은 대답하지 않는다. 마샬이 고개를 한 번 끄덕인다 — 묵계다. 문이 닫히고, 카엘렌의 발걸음 소리가 돌바닥을 지나간다. 짧고, 일정하다.*

*리우가 한 발짝 떨어진 곳에서 당신을 바라본다. 말하지 않지만, 시선이 오래 머문다.*

[quest:vanishings complete]

<status>
hp: 17/20
mp: 1/4
location: harbor_watch_office
time: 16:20
day: 7
mode: peace
conditions: []
</status>
```

에이전트는 이 턴 **직후**에 엔딩 씬으로 전환한다 (SYSTEM.md `<endings>` 섹션 참조 — `---` 구분선 + tone 맞춘 본문 + 에필로그 + 재시작 안내).
