---
name: start-scene
description: "첫 턴에 PC 프리셋(전사·도적·학자)을 받아 6개 초기 상태 파일을 생성. files/pc.md 의 preset 필드가 null 일 때 사용."
---

# start-scene

살레른 항구 3막 RPG의 세션 **최초 1회**에만 호출하는 초기화 스킬.

## 언제 사용

- `files/pc.md` 의 frontmatter `preset` 필드가 `null` 인 경우 → 첫 턴에 실행
- 이미 preset 값이 있으면 호출 금지 (기존 세션 이어가기)

## 첫 턴 절차

### 1. 프리셋 선택 UI 제시

`files/next-choices.yaml` 을 다음 3개 옵션으로 `write` (overwrite):

```yaml
options:
  - label: "전사 (힘+2 민첩+1)"
    action: "전사 프리셋으로 시작"
  - label: "도적 (민첩+3 통찰+1)"
    action: "도적 프리셋으로 시작"
  - label: "학자 (통찰+2 화술+2, 4주문)"
    action: "학자 프리셋으로 시작"
```

OOC 한 줄 — "플레이어 프리셋을 선택하세요" 정도. 서사·대사 없이 선택만 기다린다.

### 2. 선택 수신 후 스크립트 실행

```
script(file: "skills/start-scene/scripts/init.ts", args: ["--preset", "<warrior|rogue|scholar>"])
```

스크립트가 다음 5개 파일을 **직접 수정**한다 (에이전트는 write 필요 없음):

- `files/pc.md` — 선택된 프리셋의 스탯·주문·배경
- `files/party.yaml` — PC HP/MP + 리우 초기 상태
- `files/inventory.yaml` — 프리셋 장비 + 기본 소지품
- `files/world-state.yaml` — `last_summary` 갱신, 시각/장소 초기화
- `files/next-choices.yaml` — Act 1 오프닝 직후 제시할 3 옵션으로 덮어씀

### 3. stdout JSON 확인

```json
{"changed":["files/pc.md","files/party.yaml",...],"deltas":{"preset":"rogue","hp_max":20,"mp_max":0,"spell_count":0,...},"summary":"프리셋 도적: HP 20/20 · MP 0/0"}
```

### 4. Act 1 오프닝 씬 append

`files/scenes/scene.md` 에 오프닝 씬을 **append** — 부두 도착, 안개, 리우와의 첫 조우. 응답 구조는 SYSTEM.md `<output_contract>` 의 출력 구조 템플릿을 따름 (`<status>` 블록이 씬 블록 최하단).

## 예시

유저 메시지: "도적 프리셋으로 시작"

```
script(file: "skills/start-scene/scripts/init.ts", args: ["--preset", "rogue"])
```

스크립트가 파일을 수정한 후 반환하는 JSON 의 `deltas.attributes` / `hp_max` / `mp_max` 를 오프닝 씬의 `<status>` 블록에 그대로 반영.

## 금지

- **프리셋 선택 전 서사 진행** — pc.md `preset` 이 `null` 이면 먼저 프리셋 제시부터
- **파일 수정 재시도** — 스크립트가 이미 파일을 수정함. 에이전트가 write 로 덮어쓰지 말 것
- **잘못된 preset slug** — `warrior` / `rogue` / `scholar` 외 값은 스크립트가 non-zero exit
