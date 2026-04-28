# 커스터마이즈 가이드

## 파일 구성

```
files/
├── status.yaml                  # HP/MP/감정/위치/상태이상
├── stats.yaml                   # 힘/민첩/통찰/화술
├── inventory.yaml               # 소지품과 증거
├── ledger.yaml                  # 장부 조각·숫자·표식 연결
├── quest.yaml                   # 현재 알려진 퀘스트
├── relationship.yaml            # 리우 신뢰와 현재 거리감
├── world-state.yaml             # 분위기 모드와 현재 막
├── characters/                  # NPC와 동료 카드
├── locations/                   # 주요 장소 6곳
├── personas/                    # /init 이후 사용자 캐릭터
├── references/                  # 문체·장면 연출 가이드
├── scenes/scene.md              # 세션 중 생성되는 본문
└── world/
    ├── setting.md               # 살레른 세계관
    └── plot-outline.md          # 3막 플롯 나침반
```

## 복잡도를 늘리고 싶다면

처음부터 스크립트와 엔딩 게이트를 추가하지 말고 아래 순서로 확장하세요.

1. `files/locations/`에 장소 1개 추가
2. `files/characters/`에 NPC 1명 추가
3. `files/world/plot-outline.md`의 Act별 비트에 연결
4. 장부 단서가 필요하면 `files/ledger.yaml`의 엔트리 1개 추가
5. 필요하면 `skills/dynamic-lorebook/data/entries/`에 로어 엔트리 1개 추가

한 번에 NPC 2명 이상, 규칙 2개 이상, 별도 스크립트 1개 이상을 추가하면 다시 복잡도가 급격히 올라갑니다.

## 톤 바꾸기

- 더 수사극으로: 전투 선택지를 줄이고 장부·증언·검문 장면을 늘립니다.
- 더 모험극으로: `locations/`에 항로, 난파선, 등대 같은 외곽 장소를 추가합니다.
- 더 정치극으로: 알라나, 테렌, 카엘렌의 선택지가 서로 충돌하도록 `plot-outline.md`를 조정합니다.

## NPC 추가

`skills/characters`를 사용하거나 기존 캐릭터 파일 하나를 복사해 수정합니다.

필수 frontmatter:

```yaml
---
name: slug
display-name: 표시 이름
color: "#6f8796"
avatar-image: assets/calm
names: "표시 이름, 영문 이름"
role: npc
---
```

감정 이미지는 없어도 됩니다. 없으면 렌더러가 기본 표시로 대체합니다.
