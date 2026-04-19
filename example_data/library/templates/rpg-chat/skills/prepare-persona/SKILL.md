---
name: prepare-persona
description: "사용자 페르소나가 아직 없을 때 한 번 호출. 프리셋 또는 자유 설정으로 traveler.md 생성. 첫 세션 부트스트랩 전용."
environment: creative
---

# prepare-persona

세션 **최초 1회**에만 호출하는 사용자 페르소나 부트스트랩 스킬. `files/personas/`에 `.md` 파일이 하나도 없을 때 사용한다.

## 언제 사용

- `files/personas/` 디렉토리가 비어있는 첫 세션 → 첫 턴에 호출
- 페르소나 파일이 이미 있으면 호출 금지 (기존 세션 이어가기)

## 첫 턴 절차

### 1. 프리셋 또는 자유 설정 안내

OOC로 한 줄만 — 서사·대사 없이 사용자 응답을 기다린다:

```
**[OOC]** 어떤 인물로 모험을 시작할까요?
- "검사" — 검을 든 용병
- "도적" — 그림자에 익숙한 모험가
- "학자" — 룬과 책으로 무장한 탐구자
- 또는 자유롭게 한 줄로 — 예: "이름은 시아, 떠도는 음유시인"
```

### 2. 사용자 응답 수신 후 스크립트 실행

#### 프리셋 선택 시

```
script(file: "skills/prepare-persona/scripts/create.ts", args: ["--preset", "<warrior|rogue|scholar>"])
```

#### 자유 설정 시

```
script(file: "skills/prepare-persona/scripts/create.ts", args: ["--name", "<영문 슬러그>", "--display-name", "<표시 이름>", "--description", "<한 줄 설명>"])
```

스크립트가 `files/personas/traveler/traveler.md`와 `files/stats.yaml`을 직접 생성한다. 에이전트가 별도 write할 필요 없음.

프리셋별 스탯 편향:
- `warrior` — STR +3 / AGI +2 / INS 0 / CHA +1
- `rogue`   — STR +1 / AGI +3 / INS +2 / CHA +1
- `scholar` — STR 0 / AGI +1 / INS +3 / CHA +2
- 자유 설정은 전 능력 +1 균형값. 필요하면 이후 턴에 `stats.yaml`을 덮어쓰는 것도 허용

### 3. 일반 세션 흐름 진입

스크립트 호출이 끝나면 SYSTEM.md "세션 흐름 1단계 (설정)"로 진입:
1. 캐릭터 파일 확인
2. `files/status.yaml`을 PC 시작 상태로 overwrite (HP/MP/감정/위치)
3. `files/scenes/scene.md`에 오프닝 append
4. 응답 끝에 `[CHOICES]` 마커로 다음 행동 후보 2-4개 제시

페르소나 정보(이름·말투)는 NPC가 사용자를 인식하는 방식에만 영향을 준다 — 사용자 행동·내면을 서술하지 않는다.

## stdout JSON

```json
{"changed":["files/personas/traveler/traveler.md","files/stats.yaml"],"summary":"페르소나 생성: 도적 (traveler) — STR 1 / AGI 3 / INS 2 / CHA 1"}
```

## 금지

- 페르소나 선택 전 서사·캐릭터 대사 진행
- 스크립트 호출 후 traveler.md를 다시 write로 덮어쓰기
- 잘못된 preset slug — `warrior` / `rogue` / `scholar` 외는 스크립트가 non-zero exit
